import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { path7za } from "7zip-bin";
import Fastify from "fastify";

import { assetRoutes } from "./assets.js";
import type { AssetRecord } from "../types/store.js";
import { findAssetByIdDb, insertAlbumWithAssetsDb } from "../repositories/album-repository.js";
import { upsertLibraryRootDb } from "../repositories/library-root-repository.js";

const run7z = async (args: string[], cwd?: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(path7za, args, { windowsHide: true, cwd });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += Buffer.from(chunk).toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`7z failed (${code}): ${stderr}`));
    });
  });

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

const seedArchiveAsset = async (input: {
  archivePath: string;
  entryPath: string;
  sizeBytes: string | null;
}) => {
  const timestamp = new Date().toISOString();
  const libraryRootId = `root_${crypto.randomUUID().replace(/-/g, "")}`;
  const albumId = `alb_${crypto.randomUUID().replace(/-/g, "")}`;
  const asset = createAssetRecord({
    albumId,
    sourceType: "zip",
    sourcePath: input.archivePath,
    zipEntryPath: input.entryPath,
    sizeBytes: input.sizeBytes
  });

  upsertLibraryRootDb({
    id: libraryRootId,
    name: "route-archive-root",
    path: path.dirname(input.archivePath),
    enabled: true,
    lastScannedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  if (!findAssetByIdDb(asset.id)) {
    insertAlbumWithAssetsDb({
      id: albumId,
      libraryRootId,
      name: "route-archive-album",
      sourceType: "zip",
      sourcePath: input.archivePath,
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

test("archive routes do not declare an empty body when scanned size metadata is zero", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-route-archive-zero-"));
  const entryDir = path.join(tempDir, "pages");
  const entryPath = "pages/page-01.jpg";
  const archivePath = path.join(tempDir, "sample.zip");
  const content = Buffer.from("zip-route-content-with-zero-size-metadata", "utf8");
  const app = Fastify();

  try {
    await fs.promises.mkdir(entryDir, { recursive: true });
    await fs.promises.writeFile(path.join(tempDir, entryPath), content);
    await run7z(["a", "-tzip", archivePath, entryPath], tempDir);
    const asset = await seedArchiveAsset({
      archivePath,
      entryPath,
      sizeBytes: "0"
    });
    await app.register(assetRoutes);
    await app.ready();

    const originalResponse = await app.inject({
      method: "GET",
      url: `/api/v1/assets/${asset.id}/original`
    });

    assert.equal(originalResponse.statusCode, 200);
    assert.equal(originalResponse.headers["content-type"], "image/jpeg");
    assert.notEqual(originalResponse.headers["content-length"], "0");
    assert.deepEqual(originalResponse.rawPayload, content);

    const thumbnailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/assets/${asset.id}/thumbnail`
    });

    assert.equal(thumbnailResponse.statusCode, 200);
    assert.equal(thumbnailResponse.headers["content-type"], "image/jpeg");
    assert.notEqual(thumbnailResponse.headers["content-length"], "0");
    assert.deepEqual(thumbnailResponse.rawPayload, content);
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
