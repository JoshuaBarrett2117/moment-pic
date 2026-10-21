import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { buildApp } from "../app.js";
import { env } from "../config/env.js";
import { createAuthToken } from "../lib/auth.js";
import { CLIENT_CLOSED_STATUS, isClientAbortError } from "../lib/media-request.js";
import { deleteAlbumDb, insertAlbumWithAssetsDb } from "../repositories/album-repository.js";
import { deleteLibraryRootDb, upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import { archiveBudget } from "../services/archive/archive-limits.js";

test("isClientAbortError 识别 AbortError 及其 cause", () => {
  assert.equal(isClientAbortError(new DOMException("请求取消", "AbortError")), true);
  assert.equal(isClientAbortError(new Error("请求取消")), false);
  assert.equal(isClientAbortError(new Error("wrapped", { cause: new DOMException("x", "AbortError") })), true);
  assert.equal(isClientAbortError("boom"), false);
});

test("客户端断开导致的中止返回 499，而不是 500", async (context) => {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const archive = `${env.libraryRootPath}/isolated-abort-${id}.7z`;
  upsertLibraryRootDb({ id, name: id, path: env.libraryRootPath, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  insertAlbumWithAssetsDb({ id, libraryRootId: id, name: id, sourceType: "zip", sourcePath: archive, sourceMtime: null, assetsFingerprint: null, coverAssetId: id, assetCount: 1, scanStatus: "ready", errorMessage: null, createdAt: timestamp, updatedAt: timestamp }, [{ id, albumId: id, name: "page.jpg", extension: "jpg", sourceType: "zip", sourcePath: archive, relativePath: null, zipEntryPath: "page.jpg", sortIndex: 1, width: 16, height: 16, sizeBytes: null, sourceMtime: null, thumbnailKey: null, createdAt: timestamp, updatedAt: timestamp }]);
  const app = buildApp();
  try {
    context.mock.method(archiveBudget, "acquire", async () => {
      throw new DOMException("媒体请求已取消", "AbortError");
    });
    const cookie = `moment_pic_auth=${createAuthToken(env.adminPassword, Date.now() + 60_000)}`;
    for (const variant of ["thumbnail", "preview", "original"]) {
      const response = await app.inject({ url: `/api/v1/assets/${id}/${variant}`, headers: { cookie } });
      assert.equal(response.statusCode, CLIENT_CLOSED_STATUS, `${variant} 应为 499，实际 ${response.statusCode}`);
      assert.notEqual(response.statusCode, 500);
      assert.doesNotMatch(response.body, /Internal Server Error/);
    }
  } finally {
    deleteAlbumDb(id);
    deleteLibraryRootDb(id);
    await app.close();
  }
});
