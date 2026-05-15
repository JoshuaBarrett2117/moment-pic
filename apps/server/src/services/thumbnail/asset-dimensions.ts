import { updateAssetMetadataDb } from "../../repositories/album-repository.js";
import type { AssetRecord } from "../../types/store.js";
import { normalizeMetadataDimensions } from "../thumbnail-options.js";
import { readOriginalBuffer } from "./original-image-source.js";
import { createSharp } from "./sharp-runtime.js";

const dimensionSyncedAssetIds = new Set<string>();

export const syncAssetDimensions = async (input: {
  asset: AssetRecord;
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
