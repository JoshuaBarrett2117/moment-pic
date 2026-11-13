import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { insertAlbumWithAssetsDb } from "./album-repository.js";
import { getRecentAlbumIdsDb, pruneAlbumViewsDb, recordAlbumViewDb } from "./system-config-repository.js";
import { getDb } from "../db/sqlite.js";

const seedAlbum = (name: string) => {
  const id = `alb_${crypto.randomUUID().replace(/-/g, "")}`;
  const ts = new Date().toISOString();
  insertAlbumWithAssetsDb({
    id, libraryRootId: "root_views", name, sourceType: "folder", sourcePath: `/views/${id}`, sourceMtime: null,
    assetsFingerprint: null, coverAssetId: null, assetCount: 0, scanStatus: "ready", errorMessage: null, createdAt: ts, updatedAt: ts
  }, []);
  return id;
};

test("最近浏览按用户隔离、同一图集只留一行，已删除的图集不出现", () => {
  const userA = `user_${crypto.randomUUID()}`;
  const userB = `user_${crypto.randomUUID()}`;
  const [a1, a2, a3] = [seedAlbum("v1"), seedAlbum("v2"), seedAlbum("v3")];
  recordAlbumViewDb(userA, a1, "2026-11-01T00:00:00.000Z");
  recordAlbumViewDb(userA, a2, "2026-11-02T00:00:00.000Z");
  recordAlbumViewDb(userA, a1, "2026-11-03T00:00:00.000Z");
  recordAlbumViewDb(userB, a3, "2026-11-04T00:00:00.000Z");
  assert.deepEqual(getRecentAlbumIdsDb(userA, 10), [a1, a2]);
  assert.deepEqual(getRecentAlbumIdsDb(userB, 10), [a3]);
  const rows = getDb().prepare("SELECT COUNT(*) AS n FROM album_views WHERE user_id = ?").get(userA) as { n: number };
  assert.equal(rows.n, 2);

  getDb().prepare("DELETE FROM albums WHERE id = ?").run(a2);
  assert.deepEqual(getRecentAlbumIdsDb(userA, 10), [a1]);

  assert.equal(pruneAlbumViewsDb(userA, 1), 1);
  assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM album_views WHERE user_id = ?").get(userA) as { n: number }).n, 1);
});
