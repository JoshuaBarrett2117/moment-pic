import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildApp } from "../app.js";
import { env } from "../config/env.js";
import { createAuthToken } from "../lib/auth.js";
import { getDb } from "../db/sqlite.js";
import { applyLibraryRootScanDiffDb, deleteAlbumDb, insertAlbumWithAssetsDb } from "../repositories/album-repository.js";
import { findAlbumProgressDb, upsertAlbumProgressDb } from "../repositories/album-progress-repository.js";
import { clearLibraryCatalogDb, clearLibraryDataDb, deleteLibraryRootDb, upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import type { AlbumRecord, AssetRecord } from "../types/store.js";

const seed = () => {
  const id = randomUUID(); const timestamp = new Date().toISOString(); const sourcePath = path.join(os.tmpdir(), id);
  upsertLibraryRootDb({ id, name: id, path: sourcePath, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  const album: AlbumRecord = { id, libraryRootId: id, name: id, sourcePath, sourceType: "folder", sourceMtime: null, assetsFingerprint: null, coverAssetId: null, assetCount: 3, scanStatus: "ready", errorMessage: null, createdAt: timestamp, updatedAt: timestamp };
  const assets: AssetRecord[] = Array.from({ length: 3 }, (_, index) => ({ id: `${id}-${index}`, albumId: id, name: `${index}.png`, extension: "png", sourceType: "folder", sourcePath: path.join(sourcePath, `${index}.png`), relativePath: null, zipEntryPath: null, sortIndex: index + 1, width: 10, height: 20, sizeBytes: "10", sourceMtime: "1", thumbnailKey: null, createdAt: timestamp, updatedAt: timestamp }));
  insertAlbumWithAssetsDb(album, assets);
  return { album, assets };
};
const cookie = () => `moment_pic_auth=${createAuthToken(env.adminPassword, Date.now() + 60_000)}`;

test("进度 API：鉴权 401、空进度、upsert、越界/错误归属/错误页序 400、缺图集 404", async () => {
  const app = buildApp(); const f = seed();
  const url = `/api/v1/albums/${f.album.id}/progress`; const headers = { cookie: cookie() };
  try {
    assert.equal((await app.inject({ url })).statusCode, 401);
    assert.equal((await app.inject({ method: "PUT", url, payload: { assetId: f.assets[0].id, assetIndex: 0 } })).statusCode, 401);
    assert.equal((await app.inject({ url: "/api/v1/albums/continue" })).statusCode, 401);
    assert.equal((await app.inject({ url, headers })).json().data, null);
    for (const index of [0, 1]) {
      const response = await app.inject({ method: "PUT", url, headers, payload: { assetId: f.assets[index].id, assetIndex: index } });
      assert.equal(response.statusCode, 200); assert.equal(response.json().data.assetIndex, index); assert.equal(response.json().data.total, 3);
      assert.match(response.json().data.updatedAt, /^\d{4}-.*Z$/);
    }
    assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM album_progress WHERE album_id=?").get(f.album.id) as { n: number }).n, 1);
    for (const payload of [{ assetId: f.assets[0].id, assetIndex: 3 }, { assetId: "foreign", assetIndex: 0 }, { assetId: f.assets[0].id, assetIndex: 1 }, { assetId: f.assets[0].id, assetIndex: -1 }]) {
      assert.equal((await app.inject({ method: "PUT", url, headers, payload })).statusCode, 400);
    }
    assert.equal((await app.inject({ url: "/api/v1/albums/missing/progress", headers })).statusCode, 404);
    assert.equal((await app.inject({ method: "PUT", url: "/api/v1/shares/token/progress", payload: { assetId: f.assets[0].id, assetIndex: 0 } })).statusCode, 404);
    deleteAlbumDb(f.album.id); assert.equal(findAlbumProgressDb(f.album.id), null);
    assert.equal((await app.inject({ url, headers })).statusCode, 404);
  } finally { await app.close(); deleteLibraryRootDb(f.album.id); }
});

test("continue 按阅读 ISO 时间倒序，排除读完但单图进度保留 finished", async () => {
  const app = buildApp(); const fixtures = [seed(), seed(), seed()]; const headers = { cookie: cookie() };
  try {
    fixtures.forEach((f, index) => upsertAlbumProgressDb(f.album.id, { assetId: f.assets[index === 2 ? 2 : 0].id, assetIndex: index === 2 ? 2 : 0, total: 3, updatedAt: `2026-10-${10 + index}T00:00:00.000Z` }));
    const result = (await app.inject({ url: "/api/v1/albums/continue?limit=20", headers })).json().data.items;
    assert.deepEqual(result.map((item: { album: { id: string } }) => item.album.id), [fixtures[1].album.id, fixtures[0].album.id]);
    assert.equal((await app.inject({ url: "/api/v1/albums/continue?limit=1", headers })).json().data.items.length, 1);
    assert.equal((await app.inject({ url: `/api/v1/albums/${fixtures[2].album.id}/progress`, headers })).json().data.finished, true);
  } finally { await app.close(); fixtures.forEach((f) => deleteLibraryRootDb(f.album.id)); }
});

test("重扫对账：保留稳定资产进度、重算页序和 total、不改阅读时间，资产消失则清理", () => {
  const f = seed(); const updatedAt = "2026-10-01T00:00:00.000Z";
  try {
    upsertAlbumProgressDb(f.album.id, { assetId: f.assets[1].id, assetIndex: 1, total: 3, updatedAt });
    const nextAssets = [{ ...f.assets[0], id: `${f.album.id}-new`, sortIndex: 1 }, ...f.assets.map((a) => ({ ...a, sortIndex: a.sortIndex + 1 }))];
    applyLibraryRootScanDiffDb({ removedAlbumIds: [], replacedAlbums: [{ existingAlbumId: f.album.id, album: { ...f.album, assetCount: 4 }, assets: nextAssets }] });
    assert.deepEqual(findAlbumProgressDb(f.album.id), { assetId: f.assets[1].id, assetIndex: 2, total: 4, updatedAt, finished: false });
    applyLibraryRootScanDiffDb({ removedAlbumIds: [], replacedAlbums: [{ existingAlbumId: f.album.id, album: { ...f.album, assetCount: 0 }, assets: [] }] });
    assert.equal(findAlbumProgressDb(f.album.id), null);
  } finally { deleteLibraryRootDb(f.album.id); }
});

for (const mode of ["scan-remove", "delete-root", "clear-root", "clear-catalog"] as const) {
  test(`进度清理与父删除同事务：${mode}`, () => {
    const f = seed();
    upsertAlbumProgressDb(f.album.id, { assetId: f.assets[0].id, assetIndex: 0, total: 3, updatedAt: new Date().toISOString() });
    if (mode === "scan-remove") applyLibraryRootScanDiffDb({ removedAlbumIds: [f.album.id], replacedAlbums: [] });
    if (mode === "delete-root") deleteLibraryRootDb(f.album.id);
    if (mode === "clear-root") clearLibraryDataDb(f.album.id);
    if (mode === "clear-catalog") clearLibraryCatalogDb();
    assert.equal(findAlbumProgressDb(f.album.id), null);
    deleteLibraryRootDb(f.album.id);
  });
}
