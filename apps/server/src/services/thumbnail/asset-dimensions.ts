import { updateAssetMetadataDb } from "../../repositories/album-repository.js";
import type { AssetRecord } from "../../types/store.js";
import { normalizeMetadataDimensions } from "../thumbnail-options.js";
import { createSharp, releaseSharpResources, type SharpInput } from "./sharp-runtime.js";

const hasPersistedDimensions = (asset: AssetRecord) =>
  typeof asset.width === "number" && asset.width > 0 && typeof asset.height === "number" && asset.height > 0;

export const syncAssetDimensions = async (input: {
  asset: AssetRecord;
  sharpInput?: SharpInput;
}): Promise<{ width: number; height: number } | null> => {
  const { asset } = input;
  // 已持久化宽高直接返回；不再在内存里为每个资产留一条“已同步”记录（百万资产时约 100 MB）。
  if (hasPersistedDimensions(asset)) {
    return { width: asset.width as number, height: asset.height as number };
  }

  if (!input.sharpInput) {
    return null;
  }

  try {
    const metadata = await createSharp(input.sharpInput).metadata();
    const normalized = normalizeMetadataDimensions(metadata);
    if (!normalized.width || !normalized.height) {
      return null;
    }

    if (asset.width !== normalized.width || asset.height !== normalized.height) {
      updateAssetMetadataDb(asset.id, {
        width: normalized.width,
        height: normalized.height,
        thumbnailKey: asset.thumbnailKey,
        updatedAt: new Date().toISOString()
      });
    }

    return {
      width: normalized.width,
      height: normalized.height
    };
  } finally {
    releaseSharpResources();
  }
};
