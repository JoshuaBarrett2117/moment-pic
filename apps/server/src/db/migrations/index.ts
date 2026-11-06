import type Database from "better-sqlite3";

import { baselineMigration } from "./0001-baseline.js";

export type Migration = {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
};

/**
 * 有序迁移列表。规则：
 * - 只追加，不修改已发布的迁移；
 * - 版本号连续递增，记录在 SQLite `PRAGMA user_version`；
 * - 每个迁移在独立事务中执行，失败整体回滚并拒绝启动。
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "baseline", up: baselineMigration }
];

export const getSchemaVersion = (db: Database.Database): number => Number(db.pragma("user_version", { simple: true }));

export const runMigrations = (db: Database.Database, migrations: readonly Migration[] = MIGRATIONS): number[] => {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) throw new Error(`迁移版本必须从 1 连续递增: ${migration.name}`);
  });
  const current = getSchemaVersion(db);
  const latest = migrations.at(-1)?.version ?? 0;
  if (current > latest) throw new Error(`数据库结构版本 ${current} 高于程序支持的 ${latest}，请升级程序后再启动`);
  const applied: number[] = [];
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    })();
    applied.push(migration.version);
  }
  return applied;
};
