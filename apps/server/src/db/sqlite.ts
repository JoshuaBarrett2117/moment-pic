import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { env } from "../config/env.js";
import { runMigrations } from "./migrations/index.js";

let database: Database.Database | null = null;
const statementCache = new WeakMap<Database.Database, Map<string, Database.Statement>>();

const ensureDbDir = () => {
  fs.mkdirSync(path.dirname(env.sqlitePath), { recursive: true });
};

const bootstrap = (db: Database.Database) => {
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 2000");
  // WAL 下 NORMAL 仍保证一致性（断电最多丢最后一个事务）；32 MB 页缓存、临时表放内存、256 MB mmap 读。
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -32000");
  db.pragma("temp_store = MEMORY");
  db.pragma("mmap_size = 268435456");
  runMigrations(db);
  // albums_fts 以 rowid 关联 albums；手动 VACUUM 可能改变 rowid，启动时重建（仅索引相册名，代价很小）
  db.exec("INSERT INTO albums_fts (albums_fts) VALUES ('rebuild')");
};

export const getDb = () => {
  if (!database) {
    ensureDbDir();
    database = new Database(env.sqlitePath);
    bootstrap(database);
  }

  return database;
};

/** 热路径语句记忆化：同一连接同一 SQL 只 prepare 一次（连接替换后自动失效）。 */
export const stmt = (sql: string): Database.Statement => {
  const db = getDb();
  let cache = statementCache.get(db);
  if (!cache) {
    cache = new Map();
    statementCache.set(db, cache);
  }
  let statement = cache.get(sql);
  if (!statement) {
    statement = db.prepare(sql);
    cache.set(sql, statement);
  }
  return statement;
};
