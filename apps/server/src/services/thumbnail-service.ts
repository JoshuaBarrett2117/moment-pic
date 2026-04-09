import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import sharp from "sharp";

import { env } from "../config/env.js";
import { findAssetByIdDb, findThumbnailByAssetIdDb, makeId, updateAssetMetadataDb, upsertThumbnailDb } from "./sqlite-store.js";
import { readZipEntryBuffer } from "./zip.js";

const THUMBNAIL_WIDTH = 360;
const THUMBNAIL_HEIGHT = 360;

const ensureCacheDir = async () => {
  await fs.promises.mkdir(env.cacheDir, { recursive: true });
};

const buildCacheKey = (input: { sourcePath: string; zipEntryPath: string | null; sourceMtime: string | null }) =>
  crypto
    .createHash("sha1")
    .update(`${input.sourcePath}|${input.zipEntryPath ?? ""}|${input.sourceMtime ?? ""}`)
    .digest("hex");

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
    buffer: await readZipEntryBuffer(asset.sourcePath, asset.zipEntryPath ?? "")
  };
};

export const ensureThumbnail = async (assetId: string) => {
  await ensureCacheDir();
  const { asset, buffer } = await readOriginalBuffer(assetId);
  const cacheKey = buildCacheKey({
    sourcePath: asset.sourcePath,
    zipEntryPath: asset.zipEntryPath,
    sourceMtime: asset.sourceMtime
  });
  const filePath = path.join(env.cacheDir, `${cacheKey}.jpg`);

  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
  } catch {
    await sharp(buffer, { animated: true })
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
        fit: "cover",
        position: "centre"
      })
      .jpeg({ quality: 82 })
      .toFile(filePath);
  }

  const metadata = await sharp(buffer, { animated: true }).metadata();
  const updatedAt = new Date().toISOString();
  updateAssetMetadataDb(asset.id, {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    thumbnailKey: cacheKey,
    updatedAt
  });

  const existing = findThumbnailByAssetIdDb(asset.id);
  upsertThumbnailDb({
    id: existing?.id ?? makeId("thumb"),
    assetId: asset.id,
    cacheKey,
    format: "jpeg",
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    filePath,
    status: "ready",
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt
  });

  return {
    filePath,
    mimeType: "image/jpeg"
  };
};

export const readOriginalImage = async (assetId: string) => {
  const { asset, buffer } = await readOriginalBuffer(assetId);
  return { asset, buffer };
};
