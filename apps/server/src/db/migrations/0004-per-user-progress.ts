import type Database from "better-sqlite3";

/**
 * 阅读进度按用户隔离（user_version 3 → 4）：album_progress 主键改为 (user_id, album_id)。
 * 旧数据归属最早创建的管理员；若尚无用户（全新库），归属占位 id，首个管理员创建后由服务启动时认领。
 */
export const LEGACY_PROGRESS_OWNER = "__legacy_owner__";

export const perUserProgressMigration = (db: Database.Database): void => {
  const owner = (db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined)?.id ?? LEGACY_PROGRESS_OWNER;
  db.exec(`
    CREATE TABLE album_progress_v2 (
      user_id TEXT NOT NULL,
      album_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_index INTEGER NOT NULL,
      total INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, album_id),
      CHECK (asset_index >= 0),
      CHECK (total >= 0)
    );
  `);
  db.prepare(`INSERT INTO album_progress_v2 (user_id, album_id, asset_id, asset_index, total, updated_at)
    SELECT ?, album_id, asset_id, asset_index, total, updated_at FROM album_progress`).run(owner);
  db.exec(`
    DROP TABLE album_progress;
    ALTER TABLE album_progress_v2 RENAME TO album_progress;
    CREATE INDEX IF NOT EXISTS idx_album_progress_user_updated_at ON album_progress (user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_album_progress_album_id ON album_progress (album_id);
  `);
};
