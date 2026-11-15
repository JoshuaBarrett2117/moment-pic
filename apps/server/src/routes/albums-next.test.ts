import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../app.js";
import { getDb } from "../db/sqlite.js";
import { testSessionCookie } from "../test-support/session.js";
import { clearAlbumListCache } from "../services/album-service.js";

const ROOT = "route-next-root";

test("GET /api/v1/albums/:id/next：按列表排序/筛选键集定位后继，跨页、同值、最后一个、不存在", async () => {
  const insert = getDb().prepare(`INSERT INTO albums (id, library_root_id, name, source_type, source_path, asset_count, scan_status, is_favorite, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, '2026-01-01', ?)`);
  // nx-0..nx-5：updated_at 递增；nx-2 与 nx-3 同一时刻（同值按 id 决胜）；nx-1、nx-4 为压缩包；nx-0、nx-3、nx-5 已收藏
  const rows: Array<[string, string, number, number, string]> = [
    ["nx-0", "folder", 5, 1, "2026-08-01T00:00:00.000Z"],
    ["nx-1", "zip", 3, 0, "2026-08-02T00:00:00.000Z"],
    ["nx-2", "folder", 9, 0, "2026-08-03T00:00:00.000Z"],
    ["nx-3", "folder", 1, 1, "2026-08-03T00:00:00.000Z"],
    ["nx-4", "zip", 7, 0, "2026-08-05T00:00:00.000Z"],
    ["nx-5", "folder", 2, 1, "2026-08-06T00:00:00.000Z"]
  ];
  for (const [id, sourceType, assetCount, favorite, updatedAt] of rows) {
    insert.run(id, ROOT, `next ${id}`, sourceType, `/nx/${id}`, assetCount, favorite, updatedAt);
  }
  clearAlbumListCache();
  const app = buildApp();
  const cookie = testSessionCookie();
  try {
    const next = async (albumId: string, query = "") => {
      const response = await app.inject({ url: `/api/v1/albums/${albumId}/next?libraryRootId=${ROOT}&${query}`, headers: { cookie } });
      return { status: response.statusCode, id: response.statusCode === 200 ? (response.json().data.album?.id ?? null) : undefined };
    };

    // 默认 updatedAt desc：与 GET /albums 顺序一致，逐个走完整条链（等价于跨任意页）
    const listed = (await app.inject({ url: `/api/v1/albums?libraryRootId=${ROOT}&pageSize=100`, headers: { cookie } })).json().data.items
      .map((item: { id: string }) => item.id);
    const walked: string[] = [listed[0]];
    for (let guard = 0; guard < 10; guard += 1) {
      const { id } = await next(walked.at(-1)!);
      if (!id) break;
      walked.push(id);
    }
    assert.deepEqual(walked, listed, "逐个“下一个”必须与列表顺序完全一致（含同值 nx-2/nx-3）");

    assert.deepEqual(await next("nx-0"), { status: 200, id: null }, "列表最后一个才没有下一个");
    assert.equal((await next("nx-0", "sortOrder=asc")).id, "nx-1");
    assert.equal((await next("nx-3", "sortBy=assetCount&sortOrder=asc")).id, "nx-5");
    assert.equal((await next("nx-5", "sourceType=zip")).id, "nx-4", "筛选只作用于后继，当前图集可不满足筛选");
    assert.equal((await next("nx-4", "favoriteOnly=true")).id, "nx-3");
    assert.equal((await next("nx-0", "favoriteOnly=true&sortOrder=asc")).id, "nx-3");
    assert.equal((await next("missing-album")).status, 404);
  } finally {
    await app.close();
  }
});
