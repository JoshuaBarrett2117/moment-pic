import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Readable } from "node:stream";

import sharp from "sharp";

import { env } from "../config/env.js";
import type { AssetRecord } from "../types/store.js";
import {
  findAssetByIdDb,
  findThumbnailByAssetIdDb,
  listAlbumCoverAssetIdsDb,
  updateAssetMetadataDb,
  upsertThumbnailDb
} from "../repositories/album-repository.js";
import { makeId } from "../repositories/ids.js";
import { openArchiveEntryBody, readArchiveEntryBuffer } from "./archive.js";

const DEFAULT_THUMBNAIL_WIDTH = 360;
const DEFAULT_THUMBNAIL_HEIGHT = 360;
const MIN_THUMBNAIL_SIZE = 80;
const MAX_THUMBNAIL_SIZE = 720;
type ThumbnailFormat = "webp" | "jpeg";
export type PreviewPreset = "low" | "balanced" | "high";
type ImageVariantKind = "thumbnail" | "preview";
type ImageVariantResult = {
  filePath: string;
  mimeType: string;
  cacheKey: string;
  width: number;
  height: number;
  format: ThumbnailFormat;
};
const PREVIEW_PRESET_OPTIONS: Record<PreviewPreset, { maxWidth: number; maxHeight: number; webpQuality: number; jpegQuality: number }> = {
  low: {
    maxWidth: 1600,
    maxHeight: 1600,
    webpQuality: 70,
    jpegQuality: 72
  },
  balanced: {
    maxWidth: 2560,
    maxHeight: 2560,
    webpQuality: 80,
    jpegQuality: 82
  },
  high: {
    maxWidth: 3840,
    maxHeight: 3840,
    webpQuality: 86,
    jpegQuality: 88
  }
};
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

export type OriginalImageBody = Buffer | Readable;

sharp.cache({
  memory: 64,
  files: 0,
  items: 128
});
sharp.concurrency(2);

const THUMBNAIL_GENERATION_CONCURRENCY = 2;
const inFlightVariantTasks = new Map<string, Promise<ImageVariantResult>>();
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
  kind: ImageVariantKind;
  sourcePath: string;
  zipEntryPath: string | null;
  sourceMtime: string | null;
  width: number;
  height: number;
  format: ThumbnailFormat;
  quality: number;
}) =>
  crypto
    .createHash("sha1")
    .update(`${input.kind}|${input.sourcePath}|${input.zipEntryPath ?? ""}|${input.sourceMtime ?? ""}|${input.width}x${input.height}|${input.format}|q${input.quality}|v4`)
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

const resolvePreviewPreset = (preset?: string): PreviewPreset => {
  return preset === "low" || preset === "high" ? preset : "balanced";
};

const getEncodeQuality = (format: ThumbnailFormat, input: { webpQuality: number; jpegQuality: number }) =>
  format === "webp" ? input.webpQuality : input.jpegQuality;

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

export const openOriginalAssetSource = async (asset: AssetRecord): Promise<{
  asset: AssetRecord;
  body: OriginalImageBody;
  sizeBytes: number | null;
}> => {
  if (asset.sourceType === "folder") {
    try {
      const stat = await fs.promises.stat(asset.sourcePath);
      return {
        asset,
        body: fs.createReadStream(asset.sourcePath),
        sizeBytes: stat.size
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
      body: await openArchiveEntryBody(asset.sourcePath, asset.zipEntryPath ?? ""),
      sizeBytes: asset.sizeBytes ? Number(asset.sizeBytes) : null
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
  quality: number;
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
        await pipeline.webp({ quality: input.quality }).toFile(filePath);
      } else {
        await pipeline.jpeg({ quality: input.quality }).toFile(filePath);
      }
    } catch (error) {
      if (input.format !== "webp") {
        throw error;
      }
      finalFormat = "jpeg";
      finalCacheKey = buildCacheKey({
        kind: "thumbnail",
        sourcePath: asset.sourcePath,
        zipEntryPath: asset.zipEntryPath,
        sourceMtime: asset.sourceMtime,
        width: input.width,
        height: input.height,
        format: "jpeg",
        quality: input.quality
      });
      finalFilePath = path.join(env.cacheDir, `${finalCacheKey}.jpg`);
      await createSharp(buffer)
        .resize(input.width, input.height, {
          fit: "cover",
          position: "centre"
        })
        .jpeg({ quality: input.quality })
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
  const quality = format === "webp" ? 80 : 82;
  const cacheKey = buildCacheKey({
    kind: "thumbnail",
    sourcePath: asset.sourcePath,
    zipEntryPath: asset.zipEntryPath,
    sourceMtime: asset.sourceMtime,
    width,
    height,
    format,
    quality
  });
  const dedupeKey = cacheKey;
  const inFlight = inFlightVariantTasks.get(dedupeKey);
  if (inFlight) {
    return inFlight;
  }

  const task = ensureThumbnailWithResolvedInput({
    assetId,
    width,
    height,
    format,
    cacheKey,
    quality
  }).finally(() => {
    inFlightVariantTasks.delete(dedupeKey);
  });

  inFlightVariantTasks.set(dedupeKey, task);
  return task;
};

export const ensurePreview = async (
  assetId: string,
  input?: {
    preset?: PreviewPreset;
    format?: ThumbnailFormat;
  }
) => {
  await ensureCacheDir();
  const asset = findAssetByIdDb(assetId);
  if (!asset) {
    throw new AssetNotFoundError(assetId);
  }

  const preset = resolvePreviewPreset(input?.preset);
  const format = resolveThumbnailFormat(input?.format);
  const presetOptions = PREVIEW_PRESET_OPTIONS[preset];
  const quality = getEncodeQuality(format, presetOptions);
  const cacheKey = buildCacheKey({
    kind: "preview",
    sourcePath: asset.sourcePath,
    zipEntryPath: asset.zipEntryPath,
    sourceMtime: asset.sourceMtime,
    width: presetOptions.maxWidth,
    height: presetOptions.maxHeight,
    format,
    quality
  });
  const fileExt = format === "webp" ? "webp" : "jpg";
  const filePath = path.join(env.cacheDir, `${cacheKey}.${fileExt}`);
  const dedupeKey = cacheKey;
  const inFlight = inFlightVariantTasks.get(dedupeKey);
  if (inFlight) {
    return inFlight;
  }

  const task = withGenerationSlot(async () => {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return {
        filePath,
        mimeType: format === "webp" ? "image/webp" : "image/jpeg",
        cacheKey,
        width: presetOptions.maxWidth,
        height: presetOptions.maxHeight,
        format
      };
    } catch {
      // no-op
    }

    const { buffer } = await readOriginalBuffer(assetId);
    await syncAssetDimensions({ asset, buffer });
    let finalFormat: ThumbnailFormat = format;
    let finalFilePath = filePath;
    let finalCacheKey = cacheKey;

    try {
      const pipeline = createSharp(buffer).resize(presetOptions.maxWidth, presetOptions.maxHeight, {
        fit: "inside",
        withoutEnlargement: true
      });
      if (format === "webp") {
        await pipeline.webp({ quality }).toFile(filePath);
      } else {
        await pipeline.jpeg({ quality }).toFile(filePath);
      }
    } catch (error) {
      if (format !== "webp") {
        throw error;
      }
      finalFormat = "jpeg";
      finalCacheKey = buildCacheKey({
        kind: "preview",
        sourcePath: asset.sourcePath,
        zipEntryPath: asset.zipEntryPath,
        sourceMtime: asset.sourceMtime,
        width: presetOptions.maxWidth,
        height: presetOptions.maxHeight,
        format: "jpeg",
        quality: presetOptions.jpegQuality
      });
      finalFilePath = path.join(env.cacheDir, `${finalCacheKey}.jpg`);
      await createSharp(buffer)
        .resize(presetOptions.maxWidth, presetOptions.maxHeight, {
          fit: "inside",
          withoutEnlargement: true
        })
        .jpeg({ quality: presetOptions.jpegQuality })
        .toFile(finalFilePath);
    }

    return {
      filePath: finalFilePath,
      mimeType: finalFormat === "webp" ? "image/webp" : "image/jpeg",
      cacheKey: finalCacheKey,
      width: presetOptions.maxWidth,
      height: presetOptions.maxHeight,
      format: finalFormat
    };
  }).finally(() => {
    inFlightVariantTasks.delete(dedupeKey);
  });

  inFlightVariantTasks.set(dedupeKey, task);
  return task;
};

export const readOriginalImage = async (assetId: string) => {
  const { asset, buffer } = await readOriginalBuffer(assetId);
  return { asset, buffer };
};

export const openOriginalImage = async (assetId: string) => {
  const asset = findAssetByIdDb(assetId);

  if (!asset) {
    throw new AssetNotFoundError(assetId);
  }

  return openOriginalAssetSource(asset);
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
