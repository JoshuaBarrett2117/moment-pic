import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { path7za } from "7zip-bin";

import type { AssetRecord } from "../types/store.js";
import { findAssetByIdDb } from "./sqlite-store.js";
import { ensureThumbnail, openOriginalAssetSource } from "./thumbnail-service.js";

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

test("ensureThumbnail handles JPEGs with libvips warnings", async (t) => {
  const assetId = "ast_68c58721b729f0c1fb1fe05c2059e3f2";
  if (!findAssetByIdDb(assetId)) {
    t.skip("当前测试环境未提供该固定样本资产");
    return;
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
