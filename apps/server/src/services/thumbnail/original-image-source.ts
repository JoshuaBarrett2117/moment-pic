import fs from "node:fs";
import type { Readable } from "node:stream";

import { findAssetByIdDb } from "../../repositories/album-repository.js";
import type { AssetRecord } from "../../types/store.js";
import { openArchiveEntryBody, readArchiveEntryBuffer } from "../archive.js";

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
export type OriginalSharpInput = Buffer | string;

const toKnownPositiveSize = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : null;
};

export const readOriginalBuffer = async (assetId: string) => {
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

export const readOriginalSharpInput = async (asset: AssetRecord): Promise<{
  asset: AssetRecord;
  sharpInput: OriginalSharpInput;
}> => {
  if (asset.sourceType === "folder") {
    try {
      await fs.promises.access(asset.sourcePath, fs.constants.R_OK);
      return {
        asset,
        sharpInput: asset.sourcePath
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
      sharpInput: await readArchiveEntryBuffer(asset.sourcePath, asset.zipEntryPath ?? "")
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
    const body = await openArchiveEntryBody(asset.sourcePath, asset.zipEntryPath ?? "");
    return {
      asset,
      body,
      sizeBytes: Buffer.isBuffer(body) ? body.length : toKnownPositiveSize(asset.sizeBytes)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found") || message.includes("ENOENT")) {
      throw new OriginalAssetSourceMissingError(asset.id, asset.sourcePath);
    }
    throw error;
  }
};
