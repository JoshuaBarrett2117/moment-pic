import assert from "node:assert/strict";
import test from "node:test";

import { getDb } from "../db/sqlite.js";
import { InvalidCursorError, listAlbumsDb, listAssetsPageByAlbumIdDb, type AlbumSortBy, type SortOrder } from "./album-repository.js";
import { encodeAlbumCursor } from "./pagination-cursor.js";

const insertAlbum = (root: string, id: string, input: { name?: string; updatedAt?: string; assetCount?: number; isFavorite?: boolean } = {}) =>
  getDb().prepare(`
    INSERT INTO albums (id, library_root_id, name, source_type, source_path, source_mtime, cover_asset_id, asset_count, scan_status, error_message, is_favorite, created_at, updated_at)
    VALUES (?, ?, ?, 'folder', ?, NULL, NULL, ?, 'ready', NULL, ?, ?, ?)
  `).run(id, root, input.name ?? id, `/cursor/${root}/${id}`, input.assetCount ?? 0, input.isFavorite ? 1 : 0,
    "2026-01-01T00:00:00.000Z", input.updatedAt ?? "2026-01-01T00:00:00.000Z");

/** 顺着 nextCursor 读完全部页，返回按页拼接的 id。 */
const readAllPages = (root: string, pageSize: number, sortBy: AlbumSortBy, sortOrder: SortOrder, beforeEachPage?: (pageIndex: number) => void) => {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
    beforeEachPage?.(pageIndex);
    const result = listAlbumsDb(cursor ? { cursor, pageSize } : { page: 1, pageSize }, { libraryRootId: root, sortBy, sortOrder });
    ids.push(...result.items.map((item) => item.id));
    if (!result.nextCursor) return ids;
    cursor = result.nextCursor;
  }
  throw new Error("分页未终止");
};

test("游标分页：空图库返回空列表且 nextCursor 为 null", () => {
  const result = listAlbumsDb({ pageSize: 10 }, { libraryRootId: "cursor-empty" });
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
  assert.equal(result.nextCursor, null);
});

test("游标分页：恰好整页与最后一页 nextCursor 为 null，中间页有 nextCursor", () => {
  for (let index = 0; index < 6; index += 1) insertAlbum("cursor-last", `last-${index}`, { updatedAt: `2026-02-0${index + 1}T00:00:00.000Z` });
  const exact = listAlbumsDb({ pageSize: 6 }, { libraryRootId: "cursor-last" });
  assert.equal(exact.items.length, 6);
  assert.equal(exact.nextCursor, null, "恰好一整页时不应返回下一页游标");

  const first = listAlbumsDb({ pageSize: 4 }, { libraryRootId: "cursor-last" });
  assert.ok(first.nextCursor);
  assert.equal(first.total, 6);
  const last = listAlbumsDb({ cursor: first.nextCursor ?? undefined, pageSize: 4 }, { libraryRootId: "cursor-last" });
  assert.deepEqual(last.items.map((item) => item.id), ["last-1", "last-0"]);
  assert.equal(last.nextCursor, null);
  assert.equal(last.total, 6, "total 仍为过滤条件下的总数");
});

test("游标分页：大量相同排序值（同一时间戳/同名/同数量）各方向均不重不漏", () => {
  const root = "cursor-ties";
  for (let index = 0; index < 37; index += 1) {
    insertAlbum(root, `tie-${String(index).padStart(2, "0")}`, {
      name: index % 2 ? "同名" : "同名-b",
      updatedAt: index < 30 ? "2026-03-01T00:00:00.000Z" : `2026-03-0${index - 28}T00:00:00.000Z`,
      assetCount: index % 3
    });
  }
  const expected = Array.from({ length: 37 }, (_, index) => `tie-${String(index).padStart(2, "0")}`).sort();
  for (const sortBy of ["updatedAt", "name", "assetCount"] as const) {
    for (const sortOrder of ["asc", "desc"] as const) {
      for (const pageSize of [1, 5, 7]) {
        const ids = readAllPages(root, pageSize, sortBy, sortOrder);
        assert.equal(new Set(ids).size, ids.length, `${sortBy}/${sortOrder}/${pageSize} 出现重复`);
        assert.deepEqual([...ids].sort(), expected, `${sortBy}/${sortOrder}/${pageSize} 有遗漏`);
        // 与一次性全量排序结果一致（相同排序值按 id 次序）
        const all = listAlbumsDb({ page: 1, pageSize: 100 }, { libraryRootId: root, sortBy, sortOrder }).items.map((item) => item.id);
        assert.deepEqual(ids, all);
      }
    }
  }
});

test("游标分页：翻页间隙并发插入新行，既有行不重不漏", () => {
  const root = "cursor-concurrent";
  for (let index = 0; index < 20; index += 1) {
    insertAlbum(root, `pre-${String(index).padStart(2, "0")}`, { updatedAt: `2026-04-01T00:00:${String(index).padStart(2, "0")}.000Z` });
  }
  let inserted = 0;
  const ids = readAllPages(root, 6, "updatedAt", "desc", (pageIndex) => {
    if (pageIndex === 0) return;
    // 每翻一页前都插入“更新”的图集（排在最前）以及与已有行同时间戳的图集
    insertAlbum(root, `new-${pageIndex}-a`, { updatedAt: "2026-05-01T00:00:00.000Z" });
    insertAlbum(root, `new-${pageIndex}-b`, { updatedAt: "2026-04-01T00:00:10.000Z" });
    inserted += 2;
  });
  const preExisting = ids.filter((id) => id.startsWith("pre-"));
  assert.equal(new Set(ids).size, ids.length, "不应重复");
  assert.equal(preExisting.length, 20, "既有行不应遗漏");
  assert.ok(inserted > 0);

});

test("游标分页：格式错误或排序不一致的游标抛 InvalidCursorError；page 仍向后兼容", () => {
  for (let index = 0; index < 3; index += 1) insertAlbum("cursor-invalid", `inv-${index}`, { updatedAt: `2026-06-0${index + 1}T00:00:00.000Z` });
  for (const cursor of ["not base64!", "e30", Buffer.from("[1]").toString("base64url"), Buffer.from('{"s":"updatedAt","o":"desc","v":1,"id":"x"}').toString("base64url")]) {
    assert.throws(() => listAlbumsDb({ cursor, pageSize: 2 }, { libraryRootId: "cursor-invalid" }), InvalidCursorError, cursor);
  }
  const mismatch = encodeAlbumCursor({ sortBy: "name", order: "asc", value: "inv-0", id: "inv-0" });
  assert.throws(() => listAlbumsDb({ cursor: mismatch, pageSize: 2 }, { libraryRootId: "cursor-invalid" }), /sort mismatch/);
  assert.throws(() => listAlbumsDb({ cursor: mismatch, pageSize: 2 }, { libraryRootId: "cursor-invalid", sortBy: "name", sortOrder: "desc" }), /sort mismatch/);

  const page2 = listAlbumsDb({ page: 2, pageSize: 2 }, { libraryRootId: "cursor-invalid" });
  assert.deepEqual(page2.items.map((item) => item.id), ["inv-0"]);
  assert.equal(page2.nextCursor, null);
  const page1 = listAlbumsDb({ page: 1, pageSize: 2 }, { libraryRootId: "cursor-invalid" });
  const viaCursor = listAlbumsDb({ cursor: page1.nextCursor ?? undefined, pageSize: 2 }, { libraryRootId: "cursor-invalid" });
  assert.deepEqual(viaCursor.items.map((item) => item.id), page2.items.map((item) => item.id), "page 返回的 nextCursor 可无缝续读");
});

test("图集内图片：sort_index 游标分页不重不漏，最后一页 nextCursor 为 null；非法游标抛错", () => {
  insertAlbum("cursor-assets", "asset-album");
  const insertAsset = getDb().prepare(`INSERT INTO assets (id, album_id, name, extension, source_type, source_path, relative_path, zip_entry_path, sort_index, width, height, size_bytes, source_mtime, thumbnail_key, created_at, updated_at)
    VALUES (?, 'asset-album', ?, 'png', 'folder', ?, ?, NULL, ?, NULL, NULL, 1, NULL, NULL, '2026-01-01', '2026-01-01')`);
  for (let index = 0; index < 11; index += 1) insertAsset.run(`as-${String(index).padStart(2, "0")}`, `p${index}.png`, `/a/p${index}.png`, `p${index}.png`, Math.floor(index / 2));

  const ids: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const result = listAssetsPageByAlbumIdDb("asset-album", cursor ? { cursor, pageSize: 3 } : { page: 1, pageSize: 3 });
    ids.push(...result.items.map((item) => item.id));
    cursor = result.nextCursor ?? undefined;
    pages += 1;
  } while (cursor && pages < 100);
  assert.equal(pages, 4);
  assert.deepEqual(ids, Array.from({ length: 11 }, (_, index) => `as-${String(index).padStart(2, "0")}`));
  assert.equal(listAssetsPageByAlbumIdDb("asset-album", { page: 4, pageSize: 3 }).nextCursor, null);
  assert.equal(listAssetsPageByAlbumIdDb("asset-album", { page: 1, pageSize: 11 }).nextCursor, null);
  assert.throws(() => listAssetsPageByAlbumIdDb("asset-album", { cursor: "%%%", pageSize: 3 }), InvalidCursorError);
});
