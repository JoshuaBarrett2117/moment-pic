import assert from "node:assert/strict";
import test from "node:test";

import { getDb } from "../db/sqlite.js";
import { listAlbumsDb, toFtsPhrase } from "./album-repository.js";

const now = new Date().toISOString();
const insert = (id: string, name: string, updatedAt = now) => getDb().prepare(`
  INSERT INTO albums (id, library_root_id, name, source_type, source_path, source_mtime, cover_asset_id, asset_count, scan_status, error_message, is_favorite, created_at, updated_at)
  VALUES (?, 'search-root', ?, 'folder', ?, NULL, NULL, 0, 'ready', NULL, 0, ?, ?)
`).run(id, name, `/lib/${id}`, now, updatedAt);

test("相册搜索：≥3 字走 trigram 全文索引（含中文子串、大小写不敏感），短关键字回退 LIKE 且转义通配符", () => {
  insert("s1", "京都旅行照片集 2024");
  insert("s2", "Tokyo Night Walk");
  insert("s3", "100%_完成");
  insert("s4", "京都");
  const names = (keyword: string) => listAlbumsDb(1, 50, { libraryRootId: "search-root", keyword }).items.map((item) => item.name).sort();

  assert.deepEqual(names("旅行照片"), ["京都旅行照片集 2024"]);
  assert.deepEqual(names("night"), ["Tokyo Night Walk"]);
  assert.deepEqual(names("京都"), ["京都", "京都旅行照片集 2024"]);
  assert.deepEqual(names("%_"), ["100%_完成"]);
  assert.deepEqual(names('"OR'), []);
  assert.equal(toFtsPhrase('a"b'), '"a""b"');

  getDb().prepare("UPDATE albums SET name = ? WHERE id = 's2'").run("Osaka Night Walk");
  assert.deepEqual(names("osaka"), ["Osaka Night Walk"]);
  getDb().prepare("DELETE FROM albums WHERE id = 's1'").run();
  assert.deepEqual(names("旅行照片"), []);
});

test("相册分页：延迟关联保持排序与总数正确", () => {
  for (let index = 0; index < 25; index += 1) insert(`p${index}`, `分页-${String(index).padStart(2, "0")}`, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString());
  const page1 = listAlbumsDb(1, 10, { libraryRootId: "search-root", keyword: "分页-", sortBy: "updatedAt", sortOrder: "desc" });
  const page3 = listAlbumsDb(3, 10, { libraryRootId: "search-root", keyword: "分页-", sortBy: "updatedAt", sortOrder: "desc" });
  assert.equal(page1.total, 25);
  assert.equal(page1.items[0]?.name, "分页-24");
  assert.deepEqual(page3.items.map((item) => item.name), ["分页-04", "分页-03", "分页-02", "分页-01", "分页-00"]);
});
