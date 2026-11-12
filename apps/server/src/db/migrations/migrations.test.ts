import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { MIGRATIONS, getSchemaVersion, runMigrations } from "./index.js";
import { hasColumn } from "./helpers.js";

test("新库按顺序执行全部迁移并记录 user_version；重复执行为空操作", () => {
  const db = new Database(":memory:");
  const applied = runMigrations(db);
  assert.deepEqual(applied, MIGRATIONS.map((item) => item.version));
  assert.equal(getSchemaVersion(db), MIGRATIONS.at(-1)?.version);
  assert.deepEqual(runMigrations(db), []);
  assert.ok(hasColumn(db, "albums", "is_favorite"));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM system_config").get() as { n: number }).n, 1);
});

test("引入版本化迁移前的旧库（user_version=0、缺列）可平滑升级且保留数据", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE albums (id TEXT PRIMARY KEY, library_root_id TEXT NOT NULL, name TEXT NOT NULL, source_type TEXT NOT NULL DEFAULT 'folder', asset_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT '');
    INSERT INTO albums (id, library_root_id, name) VALUES ('a1', 'r1', '旧图集');
    CREATE TABLE system_config (id TEXT PRIMARY KEY DEFAULT 'system_config', enable_polling INTEGER NOT NULL DEFAULT 1,
      polling_interval INTEGER NOT NULL DEFAULT 60000, album_list_item_min_width INTEGER, album_detail_item_min_width INTEGER,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO system_config (id, enable_polling, polling_interval, album_list_item_min_width, album_detail_item_min_width, created_at, updated_at)
      VALUES ('system_config', 1, 60000, 240, 280, datetime('now'), datetime('now'));
  `);
  runMigrations(db);
  assert.ok(hasColumn(db, "albums", "assets_fingerprint"));
  assert.equal((db.prepare("SELECT name FROM albums WHERE id = 'a1'").get() as { name: string }).name, "旧图集");
  const config = db.prepare("SELECT * FROM system_config").get() as Record<string, number>;
  assert.equal(config.album_list_item_min_width_desktop, 240);
  assert.equal(config.album_detail_item_min_width_desktop, 280);
});

test("迁移失败整体回滚，版本号不前进；数据库版本高于程序时拒绝启动", () => {
  const db = new Database(":memory:");
  const broken = [
    { version: 1, name: "ok", up: (target: Database.Database) => target.exec("CREATE TABLE t1 (id INTEGER)") },
    { version: 2, name: "boom", up: (target: Database.Database) => { target.exec("CREATE TABLE t2 (id INTEGER)"); throw new Error("boom"); } }
  ];
  assert.throws(() => runMigrations(db, broken), /boom/);
  assert.equal(getSchemaVersion(db), 1);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 't2'").get(), undefined);
  db.pragma("user_version = 99");
  assert.throws(() => runMigrations(db), /高于程序支持/);
});

test("阅读进度迁移为按用户隔离：旧进度归属最早的管理员", () => {
  const db = new Database(":memory:");
  runMigrations(db, MIGRATIONS.slice(0, 3));
  db.prepare("INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES ('u-admin', 'admin', 'x', 'admin', '2026-01-01', '2026-01-01')").run();
  db.prepare("INSERT INTO album_progress (album_id, asset_id, asset_index, total, updated_at) VALUES ('a1', 'x1', 2, 9, '2026-10-01')").run();
  runMigrations(db);
  const rows = db.prepare("SELECT user_id, album_id, asset_index FROM album_progress").all();
  assert.deepEqual(rows, [{ user_id: "u-admin", album_id: "a1", asset_index: 2 }]);
  db.prepare("INSERT INTO album_progress (user_id, album_id, asset_id, asset_index, total, updated_at) VALUES ('u-viewer', 'a1', 'x0', 0, 9, '2026-10-02')").run();
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM album_progress WHERE album_id = 'a1'").get() as { n: number }).n, 2);
});

test("0005 游标分页索引：在已有数据的旧库上执行，重复执行（含 user_version 回退重跑）均安全", () => {
  const db = new Database(":memory:");
  runMigrations(db, MIGRATIONS.slice(0, 4));
  db.prepare("INSERT INTO albums (id, library_root_id, name, source_type, source_path, asset_count, scan_status, is_favorite, created_at, updated_at) VALUES ('a1', 'r1', '图集', 'folder', '/a1', 3, 'ready', 0, '2026-01-01', '2026-01-02')").run();
  const indexNames = () => new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'albums'").all() as Array<{ name: string }>).map((row) => row.name));
  assert.ok(indexNames().has("idx_albums_updated_at_name"));

  assert.deepEqual(runMigrations(db), [5]);
  const expected = ["idx_albums_updated_at_id", "idx_albums_name_id", "idx_albums_asset_count_id", "idx_albums_favorite_updated_at_id", "idx_albums_root_updated_at_id"];
  for (const name of expected) assert.ok(indexNames().has(name), name);
  for (const name of ["idx_albums_updated_at_name", "idx_albums_asset_count_name", "idx_albums_favorite_updated_at"]) assert.ok(!indexNames().has(name), name);

  // 版本号未记录成功（例如上次中途退出）时重跑 0005 不报错
  db.pragma("user_version = 4");
  assert.deepEqual(runMigrations(db), [5]);
  assert.deepEqual(runMigrations(db), []);
  assert.equal(getSchemaVersion(db), 5);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM albums").get() as { n: number }).n, 1);
  // 键集查询能使用新索引
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT id FROM albums WHERE (updated_at, id) < ('2026-02-01', 'z') ORDER BY updated_at DESC, id DESC LIMIT 3").all() as Array<{ detail: string }>;
  assert.ok(plan.some((row) => row.detail.includes("idx_albums_updated_at_id")), JSON.stringify(plan));
});
