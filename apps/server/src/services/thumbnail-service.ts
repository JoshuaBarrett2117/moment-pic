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
export class AssetNotFoundError extends Error {
  constructor(assetId: string) {
    super(`asset not found: ${assetId}`);
    this.name = "AssetNotFoundError";
  }
}

export class OriginalAssetSourceMissingError extends Error {
  constructor(assetId: string, sourcePath: string) {
    super(`original asset source missing: ${assetId} -> ${sourcePath}`);
    this.name = "OriginalAssetSourceMissingError";
  }
}

const THUMBNAIL_GENERATION_CONCURRENCY = 6;
const inFlightThumbnailTasks = new Map<string, Promise<{
  filePath: string;
  mimeType: string;
  cacheKey: string;
  width: number;
  height: number;
  format: ThumbnailFormat;
}>>();
const dimensionSyncedAssetIds = new Set<string>();
let activeGenerationCount = 0;
const generationWaitQueue: Array<() => void> = [];

const withGenerationSlot = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (activeGenerationCount >= THUMBNAIL_GENERATION_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      generationWaitQueue.push(resolve);
    });
  }

  activeGenerationCount += 1;
  try {
    return await fn();
  } finally {
    activeGenerationCount = Math.max(0, activeGenerationCount - 1);
    const next = generationWaitQueue.shift();
    if (next) {
      next();
    }
  }
};

const ensureCacheDir = async () => {
  await fs.promises.mkdir(env.cacheDir, { recursive: true });
};

const createSharp = (buffer: Buffer) =>
  sharp(buffer, {
    animated: true,
    failOn: "none"
  });

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

const hasValidDimension = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const normalizeMetadataDimensions = (metadata: sharp.Metadata): { width: number | null; height: number | null } => {
  const rawWidth = hasValidDimension(metadata.width) ? metadata.width : null;
  const rawHeight = hasValidDimension(metadata.height) ? metadata.height : null;

  if (!rawWidth || !rawHeight) {
    return { width: null, height: null };
  }

  const orientation = metadata.orientation ?? 1;
  if (orientation >= 5 && orientation <= 8) {
    return {
      width: rawHeight,
      height: rawWidth
    };
  }

  return {
    width: rawWidth,
    height: rawHeight
  };
};

const syncAssetDimensions = async (input: {
  asset: ReturnType<typeof findAssetByIdDb> extends infer T ? (T extends null ? never : T) : never;
  buffer?: Buffer;
}) => {
  const { asset } = input;
  if (dimensionSyncedAssetIds.has(asset.id)) {
    return;
  }

  const sourceBuffer = input.buffer ?? (await readOriginalBuffer(asset.id)).buffer;
  const metadata = await createSharp(sourceBuffer).metadata();
  const normalized = normalizeMetadataDimensions(metadata);
  if (!normalized.width || !normalized.height) {
    return;
  }

  if (asset.width !== normalized.width || asset.height !== normalized.height) {
    updateAssetMetadataDb(asset.id, {
      width: normalized.width,
      height: normalized.height,
      thumbnailKey: asset.thumbnailKey,
      updatedAt: new Date().toISOString()
    });
  }

  dimensionSyncedAssetIds.add(asset.id);
};

const readOriginalBuffer = async (assetId: string) => {
  const asset = findAssetByIdDb(assetId);

  if (!asset) {
    throw new AssetNotFoundError(assetId);
  }

  if (asset.sourceType === "folder") {
    try {
      return {
        asset,
        buffer: await fs.promises.readFile(asset.sourcePath)
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new OriginalAssetSourceMissingError(asset.id, asset.sourcePath);
      }
      throw error;
    }
  }

  try {
    return {
      asset,
      buffer: await readArchiveEntryBuffer(asset.sourcePath, asset.zipEntryPath ?? "")
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found") || message.includes("ENOENT")) {
      throw new OriginalAssetSourceMissingError(asset.id, asset.sourcePath);
    }
    throw error;
  }
};

const ensureThumbnailWithResolvedInput = async (input: {
  assetId: string;
  width: number;
  height: number;
  format: ThumbnailFormat;
  cacheKey: string;
}) => {
  const asset = findAssetByIdDb(input.assetId);
  if (!asset) {
    throw new AssetNotFoundError(input.assetId);
  }

  const isDefaultSize = input.width === DEFAULT_THUMBNAIL_WIDTH && input.height === DEFAULT_THUMBNAIL_HEIGHT;
  const canUseDbRecord = isDefaultSize && input.format === "jpeg";
  const fileExt = input.format === "webp" ? "webp" : "jpg";
  const filePath = path.join(env.cacheDir, `${input.cacheKey}.${fileExt}`);
  const existing = canUseDbRecord ? findThumbnailByAssetIdDb(asset.id) : null;

  if (existing?.cacheKey === input.cacheKey) {
    try {
      await fs.promises.access(existing.filePath, fs.constants.F_OK);
      await syncAssetDimensions({ asset });
      return {
        filePath: existing.filePath,
        mimeType: input.format === "webp" ? "image/webp" : "image/jpeg",
        cacheKey: input.cacheKey,
        width: input.width,
        height: input.height,
        format: input.format
      };
    } catch {
      // no-op
    }
  }

  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    await syncAssetDimensions({ asset });
    if (canUseDbRecord && existing?.cacheKey !== input.cacheKey) {
      const updatedAt = new Date().toISOString();
      updateAssetMetadataDb(asset.id, {
        width: asset.width,
        height: asset.height,
        thumbnailKey: input.cacheKey,
        updatedAt
      });
      upsertThumbnailDb({
        id: existing?.id ?? makeId("thumb"),
        assetId: asset.id,
        cacheKey: input.cacheKey,
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
      mimeType: input.format === "webp" ? "image/webp" : "image/jpeg",
      cacheKey: input.cacheKey,
      width: input.width,
      height: input.height,
      format: input.format
    };
  } catch {
    // no-op
  }

  return withGenerationSlot(async () => {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return {
        filePath,
        mimeType: input.format === "webp" ? "image/webp" : "image/jpeg",
        cacheKey: input.cacheKey,
        width: input.width,
        height: input.height,
        format: input.format
      };
    } catch {
      // no-op
    }

    const { buffer } = await readOriginalBuffer(input.assetId);
    await syncAssetDimensions({ asset, buffer });
    let finalFormat: ThumbnailFormat = input.format;
    let finalFilePath = filePath;
    let finalCacheKey = input.cacheKey;
    try {
      const pipeline = createSharp(buffer).resize(input.width, input.height, {
        fit: "cover",
        position: "centre"
      });
      if (input.format === "webp") {
        await pipeline.webp({ quality: 80 }).toFile(filePath);
      } else {
        await pipeline.jpeg({ quality: 82 }).toFile(filePath);
      }
    } catch (error) {
      if (input.format !== "webp") {
        throw error;
      }
      finalFormat = "jpeg";
      finalCacheKey = buildCacheKey({
        sourcePath: asset.sourcePath,
        zipEntryPath: asset.zipEntryPath,
        sourceMtime: asset.sourceMtime,
        width: input.width,
        height: input.height,
        format: "jpeg"
      });
      finalFilePath = path.join(env.cacheDir, `${finalCacheKey}.jpg`);
      await createSharp(buffer)
        .resize(input.width, input.height, {
          fit: "cover",
          position: "centre"
        })
        .jpeg({ quality: 82 })
        .toFile(finalFilePath);
    }

    if (canUseDbRecord) {
      const metadata = await createSharp(buffer).metadata();
      const normalized = normalizeMetadataDimensions(metadata);
      const updatedAt = new Date().toISOString();
      updateAssetMetadataDb(asset.id, {
        width: normalized.width,
        height: normalized.height,
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
      width: input.width,
      height: input.height,
      format: finalFormat
    };
  });
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
    throw new AssetNotFoundError(assetId);
  }

  const { width, height } = resolveThumbnailSize(input);
  const format = resolveThumbnailFormat(input?.format);
  const cacheKey = buildCacheKey({
    sourcePath: asset.sourcePath,
    zipEntryPath: asset.zipEntryPath,
    sourceMtime: asset.sourceMtime,
    width,
    height,
    format
  });
  const dedupeKey = cacheKey;
  const inFlight = inFlightThumbnailTasks.get(dedupeKey);
  if (inFlight) {
    return inFlight;
  }

  const task = ensureThumbnailWithResolvedInput({
    assetId,
    width,
    height,
    format,
    cacheKey
  }).finally(() => {
    inFlightThumbnailTasks.delete(dedupeKey);
  });

  inFlightThumbnailTasks.set(dedupeKey, task);
  return task;
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
