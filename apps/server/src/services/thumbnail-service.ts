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

const ensureCacheDir = async () => {
  await fs.promises.mkdir(env.cacheDir, { recursive: true });
};

const buildCacheKey = (input: {
  sourcePath: string;
  zipEntryPath: string | null;
  sourceMtime: string | null;
  width: number;
  height: number;
}) =>
  crypto
    .createHash("sha1")
    .update(`${input.sourcePath}|${input.zipEntryPath ?? ""}|${input.sourceMtime ?? ""}|${input.width}x${input.height}|v2`)
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
  }
) => {
  await ensureCacheDir();
  const asset = findAssetByIdDb(assetId);
  if (!asset) {
    throw new Error("asset not found");
  }

  const { width, height } = resolveThumbnailSize(input);
  const isDefaultSize = width === DEFAULT_THUMBNAIL_WIDTH && height === DEFAULT_THUMBNAIL_HEIGHT;
  const cacheKey = buildCacheKey({
    sourcePath: asset.sourcePath,
    zipEntryPath: asset.zipEntryPath,
    sourceMtime: asset.sourceMtime,
    width,
    height
  });
  const filePath = path.join(env.cacheDir, `${cacheKey}.jpg`);
  const existing = isDefaultSize ? findThumbnailByAssetIdDb(asset.id) : null;

  // Prefer on-disk cache hit and skip expensive source image decoding.
  if (existing?.cacheKey === cacheKey) {
    try {
      await fs.promises.access(existing.filePath, fs.constants.F_OK);
      return {
        filePath: existing.filePath,
        mimeType: "image/jpeg",
        cacheKey,
        width,
        height
      };
    } catch {
      // fall through and regenerate when cache entry is stale
    }
  }

  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    if (isDefaultSize && existing?.cacheKey !== cacheKey) {
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
      mimeType: "image/jpeg",
      cacheKey,
      width,
      height
    };
  } catch {
    // fall through and generate thumbnail from source
  }

  const { buffer } = await readOriginalBuffer(assetId);

  await sharp(buffer, { animated: true })
    .resize(width, height, {
      fit: "cover",
      position: "centre"
    })
    .jpeg({ quality: 82 })
    .toFile(filePath);

  if (isDefaultSize) {
    const metadata = await sharp(buffer, { animated: true }).metadata();
    const updatedAt = new Date().toISOString();
    updateAssetMetadataDb(asset.id, {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
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
    mimeType: "image/jpeg",
    cacheKey,
    width,
    height
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
}) => {
  const targetConcurrency = Math.max(1, Math.min(input?.concurrency ?? 3, 8));
  const assetIds = listAlbumCoverAssetIdsDb(input?.libraryRootId, input?.limit ?? 2000);
  let completed = 0;
  let failed = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < assetIds.length) {
      const currentIndex = cursor;
      cursor += 1;
      const assetId = assetIds[currentIndex];
      try {
        await ensureThumbnail(assetId);
        completed += 1;
      } catch {
        failed += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: targetConcurrency }, () => worker()));

  return {
    total: assetIds.length,
    completed,
    failed
  };
};
