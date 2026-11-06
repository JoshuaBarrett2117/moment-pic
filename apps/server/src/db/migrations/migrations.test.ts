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
    CREATE TABLE albums (id TEXT PRIMARY KEY, library_root_id TEXT NOT NULL, name TEXT NOT NULL, source_type TEXT NOT NULL DEFAULT 'folder');
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
