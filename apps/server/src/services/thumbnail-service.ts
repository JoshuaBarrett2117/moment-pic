import fs from "node:fs";

import { env } from "../config/env.js";
import {
  findAssetByIdDb,
  listAlbumCoverAssetIdsDb
} from "../repositories/album-repository.js";
import {
  AssetNotFoundError,
  openOriginalAssetSource,
  OriginalAssetSourceMissingError,
  readOriginalBuffer,
  type OriginalImageBody
} from "./thumbnail/original-image-source.js";
import {
  ensurePreviewVariant,
  ensureThumbnailVariant,
  type ImageVariantResult
} from "./thumbnail/image-variant-generator.js";
import {
  buildCacheKey,
  getEncodeQuality,
  PREVIEW_PRESET_OPTIONS,
  resolvePreviewPreset,
  resolveThumbnailFormat,
  resolveThumbnailSize,
  type PreviewPreset,
  type ThumbnailFormat
} from "./thumbnail-options.js";

export type { PreviewPreset } from "./thumbnail-options.js";
export {
  AssetNotFoundError,
  openOriginalAssetSource,
  OriginalAssetSourceMissingError
} from "./thumbnail/original-image-source.js";

export type { OriginalImageBody } from "./thumbnail/original-image-source.js";
const inFlightVariantTasks = new Map<string, Promise<ImageVariantResult>>();

const ensureCacheDir = async () => {
  await fs.promises.mkdir(env.cacheDir, { recursive: true });
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

  const task = ensureThumbnailVariant({
    asset,
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
  const dedupeKey = cacheKey;
  const inFlight = inFlightVariantTasks.get(dedupeKey);
  if (inFlight) {
    return inFlight;
  }

  const task = ensurePreviewVariant({
    asset,
    preset,
    format,
    cacheKey,
    quality
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

export type CoverThumbnailWarmupResult = {
  total: number;
  completed: number;
  failed: number;
  recentTotal: number;
  remainingTotal: number;
};

export const warmupCoverThumbnails = async (input?: {
  libraryRootId?: string;
  concurrency?: number;
  limit?: number;
  recentLimit?: number;
}): Promise<CoverThumbnailWarmupResult> => {
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
