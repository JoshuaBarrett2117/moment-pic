import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../app.js";
import { getDb } from "../db/sqlite.js";
import { testSessionCookie } from "../test-support/session.js";
import { clearAlbumListCache } from "../services/album-service.js";

const ROOT = "route-cursor-root";

test("GET /api/v1/albums：nextCursor 续读不重不漏；非法/排序不一致游标返回 400；page 向后兼容", async () => {
  const insert = getDb().prepare(`INSERT INTO albums (id, library_root_id, name, source_type, source_path, asset_count, scan_status, is_favorite, created_at, updated_at)
    VALUES (?, ?, ?, 'folder', ?, 0, 'ready', 0, '2026-01-01', ?)`);
  for (let index = 0; index < 7; index += 1) insert.run(`rc-${index}`, ROOT, `rc-${index}`, `/rc/${index}`, index < 4 ? "2026-07-01T00:00:00.000Z" : `2026-07-0${index}T00:00:00.000Z`);
  clearAlbumListCache();
  const app = buildApp();
  const cookie = testSessionCookie();
  try {
    const get = (query: string) => app.inject({ url: `/api/v1/albums?libraryRootId=${ROOT}&pageSize=3&${query}`, headers: { cookie } });
    const ids: string[] = [];
    let cursor: string | null = null;
    let page = 1;
    do {
      const response = await get(cursor ? `cursor=${encodeURIComponent(cursor)}&page=${page}` : "");
      assert.equal(response.statusCode, 200);
      const data = response.json().data;
      assert.equal(data.pagination.total, 7);
      assert.equal(data.pagination.page, page, "游标请求回显 page 序号");
      ids.push(...data.items.map((item: { id: string }) => item.id));
      cursor = data.pagination.nextCursor;
      page += 1;
    } while (cursor && page < 20);
    assert.equal(page, 4);
    assert.equal(new Set(ids).size, 7);

    const bad = await get("cursor=@@@");
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().code, 4012);
    const first = (await get("")).json().data;
    const mismatch = await get(`cursor=${first.pagination.nextCursor}&sortOrder=asc`);
    assert.equal(mismatch.statusCode, 400);

    const legacy = (await get("page=3")).json().data;
    assert.deepEqual(legacy.items.map((item: { id: string }) => item.id), [ids[6]]);
    assert.equal(legacy.pagination.nextCursor, null);

    const assetsBad = await app.inject({ url: "/api/v1/albums/rc-0/assets?cursor=@@", headers: { cookie } });
    assert.equal(assetsBad.statusCode, 400);
    const assets = (await app.inject({ url: "/api/v1/albums/rc-0/assets", headers: { cookie } })).json().data;
    assert.deepEqual(assets.items, []);
    assert.equal(assets.pagination.nextCursor, null);
  } finally {
    await app.close();
  }
});
