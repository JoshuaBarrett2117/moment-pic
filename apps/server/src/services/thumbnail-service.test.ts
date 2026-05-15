import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { path7za } from "7zip-bin";
import sharp from "sharp";

import type { AssetRecord } from "../types/store.js";
import { findAssetByIdDb, insertAlbumWithAssetsDb } from "../repositories/album-repository.js";
import { upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import { ensurePreview, ensureThumbnail, openOriginalAssetSource } from "./thumbnail-service.js";

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

const readBody = async (body: Buffer | Readable): Promise<Buffer> => {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const createAssetRecord = (overrides: Partial<AssetRecord>): AssetRecord => ({
  id: "ast_test",
  albumId: "alb_test",
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

test("ensureThumbnail generates thumbnails from repository JPEG fixtures without relying on preloaded DB assets", async () => {
  const sourcePath = path.resolve("apps/server/samples/library/风景1/001.jpg");
  const timestamp = new Date().toISOString();
  const suffix = crypto.randomUUID().replace(/-/g, "");
  const libraryRootId = `root_thumbnail_fixture_${suffix}`;
  const albumId = `alb_thumbnail_fixture_${suffix}`;
  const assetId = `ast_thumbnail_fixture_${suffix}`;
  const stat = await fs.promises.stat(sourcePath);

  const asset = createAssetRecord({
    id: assetId,
    albumId,
    sourceType: "folder",
    sourcePath,
    sizeBytes: String(stat.size)
  });

  upsertLibraryRootDb({
    id: libraryRootId,
    name: "thumbnail-fixture-root",
    path: path.dirname(sourcePath),
    enabled: true,
    lastScannedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  if (!findAssetByIdDb(assetId)) {
    insertAlbumWithAssetsDb({
      id: albumId,
      libraryRootId,
      name: "thumbnail-fixture-album",
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

  const thumbnail = await ensureThumbnail(assetId);

  assert.equal(thumbnail.mimeType, "image/jpeg");
  await fs.promises.access(thumbnail.filePath, fs.constants.F_OK);
});

test("openOriginalAssetSource streams folder assets without buffering the route response", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-original-folder-"));
  const sourcePath = path.join(tempDir, "sample.jpg");
  const content = Buffer.from("folder-stream-content", "utf8");

  try {
    await fs.promises.writeFile(sourcePath, content);
    const asset = createAssetRecord({
      sourceType: "folder",
      sourcePath,
      sizeBytes: String(content.length)
    });

    const result = await openOriginalAssetSource(asset);

    assert.equal(Buffer.isBuffer(result.body), false);
    assert.equal(result.sizeBytes, content.length);
    assert.deepEqual(await readBody(result.body), content);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("openOriginalAssetSource keeps archive-backed assets readable through the new body API", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-original-zip-"));
  const entryDir = path.join(tempDir, "pages");
  const entryPath = "pages/page-01.jpg";
  const archivePath = path.join(tempDir, "sample.zip");
  const content = Buffer.from("zip-stream-content", "utf8");

  try {
    await fs.promises.mkdir(entryDir, { recursive: true });
    await fs.promises.writeFile(path.join(tempDir, entryPath), content);
    await run7z(["a", "-tzip", archivePath, entryPath], tempDir);

    const asset = createAssetRecord({
      sourceType: "zip",
      sourcePath: archivePath,
      zipEntryPath: entryPath,
      sizeBytes: String(content.length)
    });

    const result = await openOriginalAssetSource(asset);

    assert.equal(result.sizeBytes, content.length);
    assert.deepEqual(await readBody(result.body), content);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("ensurePreview generates a resized preview for folder assets", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-preview-folder-"));
  const sourcePath = path.join(tempDir, "sample.jpg");
  const timestamp = new Date().toISOString();
  const suffix = crypto.randomUUID().replace(/-/g, "");
  const libraryRootId = `root_preview_folder_${suffix}`;
  const albumId = `alb_preview_folder_${suffix}`;
  const assetId = `ast_preview_folder_${suffix}`;

  try {
    const sourceBuffer = await sharp({
      create: {
        width: 5000,
        height: 3200,
        channels: 3,
        background: { r: 120, g: 80, b: 160 }
      }
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    await fs.promises.writeFile(sourcePath, sourceBuffer);

    const asset = createAssetRecord({
      id: assetId,
      albumId,
      sourceType: "folder",
      sourcePath,
      sizeBytes: String(sourceBuffer.length)
    });

    upsertLibraryRootDb({
      id: libraryRootId,
      name: "preview-root",
      path: tempDir,
      enabled: true,
      lastScannedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    if (!findAssetByIdDb(assetId)) {
      insertAlbumWithAssetsDb({
        id: albumId,
        libraryRootId,
        name: "preview-folder",
        sourceType: "folder",
        sourcePath: tempDir,
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

    const preview = await ensurePreview(asset.id, {
      preset: "balanced",
      format: "jpeg"
    });

    assert.equal(preview.mimeType, "image/jpeg");
    await fs.promises.access(preview.filePath, fs.constants.F_OK);

    const metadata = await sharp(preview.filePath).metadata();
    assert.ok((metadata.width ?? 0) <= 2560);
    assert.ok((metadata.height ?? 0) <= 2560);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});
