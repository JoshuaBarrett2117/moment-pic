import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Fastify from "fastify";

import { assetRoutes } from "./assets.js";
import type { AssetRecord } from "../types/store.js";
import { findAssetByIdDb, insertAlbumWithAssetsDb, upsertLibraryRootDb } from "../services/sqlite-store.js";

const createAssetRecord = (overrides: Partial<AssetRecord>): AssetRecord => ({
  id: `ast_${crypto.randomUUID().replace(/-/g, "")}`,
  albumId: `alb_${crypto.randomUUID().replace(/-/g, "")}`,
  name: "sample.jpg",
  extension: "jpg",
  sourceType: "folder",
  sourcePath: "",
  relativePath: null,
  zipEntryPath: null,
  sortIndex: 0,
  width: null,
  height: null,
  sizeBytes: null,
  sourceMtime: null,
  thumbnailKey: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

const seedFolderAsset = async (sourcePath: string) => {
  const timestamp = new Date().toISOString();
  const libraryRootId = `root_${crypto.randomUUID().replace(/-/g, "")}`;
  const albumId = `alb_${crypto.randomUUID().replace(/-/g, "")}`;
  const asset = createAssetRecord({
    albumId,
    sourceType: "folder",
    sourcePath
  });

  upsertLibraryRootDb({
    id: libraryRootId,
    name: "route-fallback-root",
    path: path.dirname(sourcePath),
    enabled: true,
    lastScannedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  if (!findAssetByIdDb(asset.id)) {
    insertAlbumWithAssetsDb({
      id: albumId,
      libraryRootId,
      name: "route-fallback-album",
      sourceType: "folder",
      sourcePath: path.dirname(sourcePath),
      sourceMtime: null,
      assetsFingerprint: null,
      coverAssetId: asset.id,
      assetCount: 1,
      scanStatus: "ready",
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }, [asset]);
  }

  return asset;
};

test("preview route falls back to streaming the original body when preview generation fails", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-route-preview-"));
  const sourcePath = path.join(tempDir, "broken.jpg");
  const content = Buffer.from("not-a-real-image-preview", "utf8");
  const app = Fastify();

  try {
    await fs.promises.writeFile(sourcePath, content);
    const asset = await seedFolderAsset(sourcePath);
    await app.register(assetRoutes);
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/assets/${asset.id}/preview?preset=balanced`
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "image/jpeg");
    assert.equal(response.headers["content-length"], String(content.length));
    assert.deepEqual(response.rawPayload, content);
  } finally {
    await app.close();
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("thumbnail route falls back to streaming the original body when thumbnail generation fails", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-route-thumbnail-"));
  const sourcePath = path.join(tempDir, "broken.jpg");
  const content = Buffer.from("not-a-real-image-thumbnail", "utf8");
  const app = Fastify();

  try {
    await fs.promises.writeFile(sourcePath, content);
    const asset = await seedFolderAsset(sourcePath);
    await app.register(assetRoutes);
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/assets/${asset.id}/thumbnail`
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "image/jpeg");
    assert.equal(response.headers["content-length"], String(content.length));
    assert.deepEqual(response.rawPayload, content);
  } finally {
    await app.close();
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});
