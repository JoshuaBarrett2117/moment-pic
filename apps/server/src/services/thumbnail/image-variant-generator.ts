import fs from "node:fs";
import path from "node:path";

import { env } from "../../config/env.js";
import { findThumbnailByAssetIdDb, updateAssetMetadataDb, upsertThumbnailDb } from "../../repositories/album-repository.js";
import { makeId } from "../../repositories/ids.js";
import type { AssetRecord } from "../../types/store.js";
import {
  buildCacheKey,
  DEFAULT_THUMBNAIL_HEIGHT,
  DEFAULT_THUMBNAIL_WIDTH,
  type PreviewPreset,
  PREVIEW_PRESET_OPTIONS,
  type ThumbnailFormat
} from "../thumbnail-options.js";
import { readOriginalSharpInput } from "./original-image-source.js";
import { createSharp, releaseSharpResources } from "./sharp-runtime.js";
import { syncAssetDimensions } from "./asset-dimensions.js";
import { withGenerationSlot } from "./generation-slot.js";

export type ImageVariantResult = {
  filePath: string;
  mimeType: string;
  cacheKey: string;
  width: number;
  height: number;
  format: ThumbnailFormat;
};

const getMimeType = (format: ThumbnailFormat) => format === "webp" ? "image/webp" : "image/jpeg";

const getFilePath = (cacheKey: string, format: ThumbnailFormat) => {
  const fileExt = format === "webp" ? "webp" : "jpg";
  return path.join(env.cacheDir, `${cacheKey}.${fileExt}`);
};

const findReadyFile = async (filePath: string) => {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
};

const writeVariantFile = async (
  filePath: string,
  write: (targetPath: string) => Promise<void>
) => {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await write(tempPath);
    const stat = await fs.promises.stat(tempPath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error(`thumbnail variant generation produced empty file: ${filePath}`);
    }
    await fs.promises.rename(tempPath, filePath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
};

export const ensureThumbnailVariant = async (input: {
  asset: AssetRecord;
  width: number;
  height: number;
  format: ThumbnailFormat;
  cacheKey: string;
  quality: number;
}): Promise<ImageVariantResult> => {
  const isDefaultSize = input.width === DEFAULT_THUMBNAIL_WIDTH && input.height === DEFAULT_THUMBNAIL_HEIGHT;
  const canUseDbRecord = isDefaultSize && input.format === "jpeg";
  const filePath = getFilePath(input.cacheKey, input.format);
  const existing = canUseDbRecord ? findThumbnailByAssetIdDb(input.asset.id) : null;

  if (existing?.cacheKey === input.cacheKey && await findReadyFile(existing.filePath)) {
    await syncAssetDimensions({ asset: input.asset });
    return {
      filePath: existing.filePath,
      mimeType: getMimeType(input.format),
      cacheKey: input.cacheKey,
      width: input.width,
      height: input.height,
      format: input.format
    };
  }

  if (await findReadyFile(filePath)) {
    await syncAssetDimensions({ asset: input.asset });
    if (canUseDbRecord && existing?.cacheKey !== input.cacheKey) {
      const updatedAt = new Date().toISOString();
      updateAssetMetadataDb(input.asset.id, {
        width: input.asset.width,
        height: input.asset.height,
        thumbnailKey: input.cacheKey,
        updatedAt
      });
      upsertThumbnailDb({
        id: existing?.id ?? makeId("thumb"),
        assetId: input.asset.id,
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
      mimeType: getMimeType(input.format),
      cacheKey: input.cacheKey,
      width: input.width,
      height: input.height,
      format: input.format
    };
  }

  return withGenerationSlot(async () => {
    try {
      if (await findReadyFile(filePath)) {
        return {
          filePath,
          mimeType: getMimeType(input.format),
          cacheKey: input.cacheKey,
          width: input.width,
          height: input.height,
          format: input.format
        };
      }

      const { sharpInput } = await readOriginalSharpInput(input.asset);
      const syncedDimensions = await syncAssetDimensions({ asset: input.asset, sharpInput });
      let finalFormat: ThumbnailFormat = input.format;
      let finalFilePath = filePath;
      let finalCacheKey = input.cacheKey;

      try {
        const pipeline = createSharp(sharpInput).resize(input.width, input.height, {
          fit: "cover",
          position: "centre"
        });
        if (input.format === "webp") {
          await writeVariantFile(filePath, (targetPath) => pipeline.webp({ quality: input.quality }).toFile(targetPath).then(() => undefined));
        } else {
          await writeVariantFile(filePath, (targetPath) => pipeline.jpeg({ quality: input.quality }).toFile(targetPath).then(() => undefined));
        }
      } catch (error) {
        if (input.format !== "webp") {
          throw error;
        }
        finalFormat = "jpeg";
        finalCacheKey = buildCacheKey({
          kind: "thumbnail",
          sourcePath: input.asset.sourcePath,
          zipEntryPath: input.asset.zipEntryPath,
          sourceMtime: input.asset.sourceMtime,
          width: input.width,
          height: input.height,
          format: "jpeg",
          quality: input.quality
        });
        finalFilePath = getFilePath(finalCacheKey, "jpeg");
        await writeVariantFile(finalFilePath, (targetPath) =>
          createSharp(sharpInput)
            .resize(input.width, input.height, {
              fit: "cover",
              position: "centre"
            })
            .jpeg({ quality: input.quality })
            .toFile(targetPath)
            .then(() => undefined)
        );
      }

      if (canUseDbRecord) {
        const updatedAt = new Date().toISOString();
        updateAssetMetadataDb(input.asset.id, {
          width: syncedDimensions?.width ?? input.asset.width,
          height: syncedDimensions?.height ?? input.asset.height,
          thumbnailKey: finalCacheKey,
          updatedAt
        });

        upsertThumbnailDb({
          id: existing?.id ?? makeId("thumb"),
          assetId: input.asset.id,
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
        mimeType: getMimeType(finalFormat),
        cacheKey: finalCacheKey,
        width: input.width,
        height: input.height,
        format: finalFormat
      };
    } finally {
      releaseSharpResources();
    }
  });
};

export const ensurePreviewVariant = async (input: {
  asset: AssetRecord;
  preset: PreviewPreset;
  format: ThumbnailFormat;
  cacheKey: string;
  quality: number;
}): Promise<ImageVariantResult> => {
  const presetOptions = PREVIEW_PRESET_OPTIONS[input.preset];
  const filePath = getFilePath(input.cacheKey, input.format);

  return withGenerationSlot(async () => {
    try {
      if (await findReadyFile(filePath)) {
        return {
          filePath,
          mimeType: getMimeType(input.format),
          cacheKey: input.cacheKey,
          width: presetOptions.maxWidth,
          height: presetOptions.maxHeight,
          format: input.format
        };
      }

      const { sharpInput } = await readOriginalSharpInput(input.asset);
      await syncAssetDimensions({ asset: input.asset, sharpInput });
      let finalFormat: ThumbnailFormat = input.format;
      let finalFilePath = filePath;
      let finalCacheKey = input.cacheKey;

      try {
        const pipeline = createSharp(sharpInput).resize(presetOptions.maxWidth, presetOptions.maxHeight, {
          fit: "inside",
          withoutEnlargement: true
        });
        if (input.format === "webp") {
          await writeVariantFile(filePath, (targetPath) => pipeline.webp({ quality: input.quality }).toFile(targetPath).then(() => undefined));
        } else {
          await writeVariantFile(filePath, (targetPath) => pipeline.jpeg({ quality: input.quality }).toFile(targetPath).then(() => undefined));
        }
      } catch (error) {
        if (input.format !== "webp") {
          throw error;
        }
        finalFormat = "jpeg";
        finalCacheKey = buildCacheKey({
          kind: "preview",
          sourcePath: input.asset.sourcePath,
          zipEntryPath: input.asset.zipEntryPath,
          sourceMtime: input.asset.sourceMtime,
          width: presetOptions.maxWidth,
          height: presetOptions.maxHeight,
          format: "jpeg",
          quality: presetOptions.jpegQuality
        });
        finalFilePath = getFilePath(finalCacheKey, "jpeg");
        await writeVariantFile(finalFilePath, (targetPath) =>
          createSharp(sharpInput)
            .resize(presetOptions.maxWidth, presetOptions.maxHeight, {
              fit: "inside",
              withoutEnlargement: true
            })
            .jpeg({ quality: presetOptions.jpegQuality })
            .toFile(targetPath)
            .then(() => undefined)
        );
      }

      return {
        filePath: finalFilePath,
        mimeType: getMimeType(finalFormat),
        cacheKey: finalCacheKey,
        width: presetOptions.maxWidth,
        height: presetOptions.maxHeight,
        format: finalFormat
      };
    } finally {
      releaseSharpResources();
    }
  });
};
