import fs from "node:fs";

import type { AssetRecord } from "../types/store.js";

import { env } from "../config/env.js";
import {
  findAssetByIdDb,
  listAlbumCoverAssetIdsDb
} from "../repositories/album-repository.js";
import {
  AssetNotFoundError,
  openOriginalAssetSource,
  readOriginalBuffer,
  type ByteRangeResolver
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
  type ThumbnailFit,
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

let cacheDirReady: Promise<void> | null = null;
/** 缓存目录只在第一次用到时创建；失败后下次重试。 */
const ensureCacheDir = (): Promise<void> => {
  cacheDirReady ??= fs.promises.mkdir(env.cacheDir, { recursive: true }).then(() => undefined, (error) => {
    cacheDirReady = null;
    throw error;
  });
  return cacheDirReady;
};

type ThumbnailInput = { fit?: ThumbnailFit; width?: number; height?: number; format?: ThumbnailFormat };
type PreviewInput = { preset?: PreviewPreset; format?: ThumbnailFormat };

/** 只算缓存键，不生成；路由用它在拿生成闸门之前判断 304。 */
export const planThumbnail = (asset: AssetRecord, input?: ThumbnailInput) => {
  const { width, height } = resolveThumbnailSize(input);
  const format = resolveThumbnailFormat(input?.format);
  const quality = format === "webp" ? 80 : 82;
  const fit = input?.fit ?? "cover";
  const cacheKey = buildCacheKey({
    kind: "thumbnail",
    fit,
    sourcePath: asset.sourcePath,
    zipEntryPath: asset.zipEntryPath,
    sourceMtime: asset.sourceMtime,
    width,
    height,
    format,
    quality
  });
  return { fit, width, height, format, quality, cacheKey };
};

export const planPreview = (asset: AssetRecord, input?: PreviewInput) => {
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
  return { preset, format, quality, cacheKey };
};

export const findAssetOrThrow = (assetId: string): AssetRecord => {
  const asset = findAssetByIdDb(assetId);
  if (!asset) throw new AssetNotFoundError(assetId);
  return asset;
};

export const ensureThumbnail = async (
  assetId: string,
  input?: ThumbnailInput & { signal?: AbortSignal; asset?: AssetRecord }
) => {
  await ensureCacheDir();
  const asset = input?.asset ?? findAssetOrThrow(assetId);
  const { fit, width, height, format, quality, cacheKey } = planThumbnail(asset, input);
  const dedupeKey = cacheKey;
  if (input?.signal) return ensureThumbnailVariant({ fit, asset, width, height, format, cacheKey, quality, signal: input.signal });
  const inFlight = inFlightVariantTasks.get(dedupeKey);
  if (inFlight) {
    return inFlight;
  }

  const task = ensureThumbnailVariant({
    fit,
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
  input?: PreviewInput & { signal?: AbortSignal; asset?: AssetRecord }
) => {
  await ensureCacheDir();
  const asset = input?.asset ?? findAssetOrThrow(assetId);
  const { preset, format, quality, cacheKey } = planPreview(asset, input);
  const dedupeKey = cacheKey;
  if (input?.signal) return ensurePreviewVariant({ asset, preset, format, cacheKey, quality, signal: input.signal });
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

export const openOriginalImage = async (assetId: string, signal?: AbortSignal, preloaded?: AssetRecord, resolveRange?: ByteRangeResolver) => {
  const asset = preloaded ?? findAssetOrThrow(assetId);
  return openOriginalAssetSource(asset, signal, resolveRange);
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
