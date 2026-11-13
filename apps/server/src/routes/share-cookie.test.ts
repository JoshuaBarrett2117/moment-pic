import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { buildApp } from "../app.js";
import { deleteAlbumDb, insertAlbumWithAssetsDb } from "../repositories/album-repository.js";
import { deleteLibraryRootDb, upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import { createAlbumShare } from "../services/album-service.js";

test("分享访问令牌只经 Cookie 传递：图片 URL 不含令牌，换浏览器（无 Cookie）打不开", async () => {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "share-cookie-"));
  const imagePath = path.join(directory, "1.png");
  await sharp({ create: { width: 8, height: 8, channels: 3, background: "#336699" } }).png().toFile(imagePath);
  upsertLibraryRootDb({ id, name: id, path: directory, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  insertAlbumWithAssetsDb(
    { id, libraryRootId: id, name: "分享测试", sourcePath: directory, sourceType: "folder", sourceMtime: null, assetsFingerprint: null, coverAssetId: id, assetCount: 1, scanStatus: "ready", errorMessage: null, createdAt: timestamp, updatedAt: timestamp },
    [{ id, albumId: id, name: "1.png", extension: "png", sourceType: "folder", sourcePath: imagePath, relativePath: null, zipEntryPath: null, sortIndex: 1, width: 8, height: 8, sizeBytes: null, sourceMtime: null, thumbnailKey: null, createdAt: timestamp, updatedAt: timestamp }]
  );
  const app = buildApp();
  try {
    const share = (await createAlbumShare(id, { password: "cookie-pass", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), origin: "https://photos.example" }))!;
    const base = `/api/v1/shares/${share.token}`;

    assert.equal((await app.inject({ method: "POST", url: `${base}/auth`, payload: { password: "wrong" } })).statusCode, 401);
    const login = await app.inject({ method: "POST", url: `${base}/auth`, payload: { password: "cookie-pass" } });
    assert.equal(login.statusCode, 200);
    assert.equal("accessToken" in login.json().data, false, "响应体不再返回令牌");
    const setCookie = String(login.headers["set-cookie"]);
    assert.match(setCookie, /^mp_share=[^;]+; Max-Age=\d+; Path=\/api\/v1\/shares\/[^;]+\/; HttpOnly; SameSite=Lax/);
    const cookie = setCookie.split(";")[0];

    const session = await app.inject({ url: `${base}/session`, headers: { cookie } });
    assert.equal(session.statusCode, 200);
    assert.equal(session.json().data.name, "分享测试");
    assert.equal((await app.inject({ url: `${base}/session` })).statusCode, 404);

    const list = await app.inject({ url: `${base}/assets`, headers: { cookie } });
    assert.equal(list.statusCode, 200);
    const item = list.json().data.items[0];
    assert.doesNotMatch(item.thumbnailUrl, /accessToken/);
    assert.doesNotMatch(item.originalUrl, /accessToken/);
    assert.equal((await app.inject({ url: `${base}/assets` })).statusCode, 404);

    const accessToken = decodeURIComponent(cookie.slice("mp_share=".length));
    for (const url of [item.thumbnailUrl, item.originalUrl]) {
      assert.equal((await app.inject({ url, headers: { cookie } })).statusCode, 200, `${url} 带 Cookie 可访问`);
      assert.equal((await app.inject({ url })).statusCode, 404, `${url} 无 Cookie 不可访问`);
      assert.equal((await app.inject({ url: `${url}?accessToken=${encodeURIComponent(accessToken)}` })).statusCode, 404, "不再接受 URL 里的令牌");
    }
  } finally {
    await app.close();
    deleteAlbumDb(id);
    deleteLibraryRootDb(id);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
