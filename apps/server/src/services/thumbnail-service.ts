import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import sharp from "sharp";

import { env } from "../config/env.js";
import { findAssetByIdDb, findThumbnailByAssetIdDb, listAlbumCoverAssetIdsDb, makeId, updateAssetMetadataDb, upsertThumbnailDb } from "./sqlite-store.js";
import { readArchiveEntryBuffer } from "./archive.js";

const DEFAULT_THUMBNAIL_WIDTH = 360;
const DEFAULT_THUMBNAIL_HEIGHT = 360;
const MIN_THUMBNAIL_SIZE = 80;
const MAX_THUMBNAIL_SIZE = 720;
type ThumbnailFormat = "webp" | "jpeg";

const ensureCacheDir = async () => {
  await fs.promises.mkdir(env.cacheDir, { recursive: true });
};

const buildCacheKey = (input: {
  sourcePath: string;
  zipEntryPath: string | null;
  sourceMtime: string | null;
  width: number;
  height: number;
  format: ThumbnailFormat;
}) =>
  crypto
    .createHash("sha1")
    .update(`${input.sourcePath}|${input.zipEntryPath ?? ""}|${input.sourceMtime ?? ""}|${input.width}x${input.height}|${input.format}|v3`)
    .digest("hex");

const sanitizeDimension = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.trunc(value as number);
  return Math.max(MIN_THUMBNAIL_SIZE, Math.min(MAX_THUMBNAIL_SIZE, normalized));
};

const resolveThumbnailSize = (input?: { width?: number; height?: number }) => {
  const width = sanitizeDimension(input?.width, DEFAULT_THUMBNAIL_WIDTH);
  const height = sanitizeDimension(input?.height, DEFAULT_THUMBNAIL_HEIGHT);
  return { width, height };
};

const resolveThumbnailFormat = (format?: string): ThumbnailFormat => {
  return format === "webp" ? "webp" : "jpeg";
};

const readOriginalBuffer = async (assetId: string) => {
  const asset = findAssetByIdDb(assetId);

  if (!asset) {
    throw new Error("asset not found");
  }

  if (asset.sourceType === "folder") {
    return {
      asset,
      buffer: await fs.promises.readFile(asset.sourcePath)
    };
  }

  return {
    asset,
    buffer: await readArchiveEntryBuffer(asset.sourcePath, asset.zipEntryPath ?? "")
  };
};

export const ensureThumbnail = async (
  assetId: string,
  input?: {
    width?: number;
    height?: number;
    format?: ThumbnailFormat;
  }
) => {
  await ensureCacheDir();
  const asset = findAssetByIdDb(assetId);
  if (!asset) {
    throw new Error("asset not found");
  }

  const { width, height } = resolveThumbnailSize(input);
  const format = resolveThumbnailFormat(input?.format);
  const isDefaultSize = width === DEFAULT_THUMBNAIL_WIDTH && height === DEFAULT_THUMBNAIL_HEIGHT;
  const canUseDbRecord = isDefaultSize && format === "jpeg";
  const cacheKey = buildCacheKey({
    sourcePath: asset.sourcePath,
    zipEntryPath: asset.zipEntryPath,
    sourceMtime: asset.sourceMtime,
    width,
    height,
    format
  });
  const fileExt = format === "webp" ? "webp" : "jpg";
  const filePath = path.join(env.cacheDir, `${cacheKey}.${fileExt}`);
  const existing = canUseDbRecord ? findThumbnailByAssetIdDb(asset.id) : null;

  // Prefer on-disk cache hit and skip expensive source image decoding.
  if (existing?.cacheKey === cacheKey) {
    try {
      await fs.promises.access(existing.filePath, fs.constants.F_OK);
      return {
        filePath: existing.filePath,
        mimeType: format === "webp" ? "image/webp" : "image/jpeg",
        cacheKey,
        width,
        height,
        format
      };
    } catch {
      // fall through and regenerate when cache entry is stale
    }
  }

  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    if (canUseDbRecord && existing?.cacheKey !== cacheKey) {
      const updatedAt = new Date().toISOString();
      updateAssetMetadataDb(asset.id, {
        width: asset.width,
        height: asset.height,
        thumbnailKey: cacheKey,
        updatedAt
      });
      upsertThumbnailDb({
        id: existing?.id ?? makeId("thumb"),
        assetId: asset.id,
        cacheKey,
        format: "jpeg",
        width: DEFAULT_THUMBNAIL_WIDTH,
        height: DEFAULT_THUMBNAIL_HEIGHT,
        filePath,
        status: "ready",
        createdAt: existing?.createdAt ?? updatedAt,
        updatedAt
      });
    }
    return {
      filePath,
      mimeType: format === "webp" ? "image/webp" : "image/jpeg",
      cacheKey,
      width,
      height,
      format
    };
  } catch {
    // fall through and generate thumbnail from source
  }

  const { buffer } = await readOriginalBuffer(assetId);
  let finalFormat: ThumbnailFormat = format;
  let finalFilePath = filePath;
  let finalCacheKey = cacheKey;
  try {
    const pipeline = sharp(buffer, { animated: true }).resize(width, height, {
      fit: "cover",
      position: "centre"
    });
    if (format === "webp") {
      await pipeline.webp({ quality: 80 }).toFile(filePath);
    } else {
      await pipeline.jpeg({ quality: 82 }).toFile(filePath);
    }
  } catch (error) {
    if (format !== "webp") {
      throw error;
    }
    // Fallback to jpeg when webp generation fails for rare image types.
    finalFormat = "jpeg";
    finalCacheKey = buildCacheKey({
      sourcePath: asset.sourcePath,
      zipEntryPath: asset.zipEntryPath,
      sourceMtime: asset.sourceMtime,
      width,
      height,
      format: "jpeg"
    });
    finalFilePath = path.join(env.cacheDir, `${finalCacheKey}.jpg`);
    await sharp(buffer, { animated: true })
      .resize(width, height, {
        fit: "cover",
        position: "centre"
      })
      .jpeg({ quality: 82 })
      .toFile(finalFilePath);
  }

  if (canUseDbRecord) {
    const metadata = await sharp(buffer, { animated: true }).metadata();
    const updatedAt = new Date().toISOString();
    updateAssetMetadataDb(asset.id, {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      thumbnailKey: finalCacheKey,
      updatedAt
    });

    upsertThumbnailDb({
      id: existing?.id ?? makeId("thumb"),
      assetId: asset.id,
      cacheKey: finalCacheKey,
      format: "jpeg",
      width: DEFAULT_THUMBNAIL_WIDTH,
      height: DEFAULT_THUMBNAIL_HEIGHT,
      filePath: finalFilePath,
      status: "ready",
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt
    });
  }

  return {
    filePath: finalFilePath,
    mimeType: finalFormat === "webp" ? "image/webp" : "image/jpeg",
    cacheKey: finalCacheKey,
    width,
    height,
    format: finalFormat
  };
};

export const readOriginalImage = async (assetId: string) => {
  const { asset, buffer } = await readOriginalBuffer(assetId);
  return { asset, buffer };
};

export const warmupCoverThumbnails = async (input?: {
  libraryRootId?: string;
  concurrency?: number;
  limit?: number;
  recentLimit?: number;
}) => {
  const targetConcurrency = Math.max(1, Math.min(input?.concurrency ?? 3, 8));
  const assetIds = listAlbumCoverAssetIdsDb(input?.libraryRootId, input?.limit ?? 2000);
  const recentLimit = Math.max(1, Math.min(input?.recentLimit ?? 80, assetIds.length || 1));
  const recentAssetIds = assetIds.slice(0, recentLimit);
  const remainingAssetIds = assetIds.slice(recentLimit);
  let completed = 0;
  let failed = 0;

  const runWarmupBatch = async (ids: string[], concurrency: number) => {
    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length) {
        const currentIndex = cursor;
        cursor += 1;
        const assetId = ids[currentIndex];
        try {
          await ensureThumbnail(assetId, { format: "webp" });
          completed += 1;
        } catch {
          failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  };

  // Phase 1: warm up most recently updated covers first.
  await runWarmupBatch(recentAssetIds, targetConcurrency);
  // Phase 2: warm up the remaining covers with slightly lower concurrency.
  await runWarmupBatch(remainingAssetIds, Math.max(1, targetConcurrency - 1));

  return {
    total: assetIds.length,
    completed,
    failed,
    recentTotal: recentAssetIds.length,
    remainingTotal: remainingAssetIds.length
  };
};
