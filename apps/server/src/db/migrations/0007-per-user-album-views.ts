import type Database from "better-sqlite3";

import { LEGACY_PROGRESS_OWNER } from "./0004-per-user-progress.js";

/**
 * 最近浏览按用户隔离并去重（user_version 6 → 7）：
 * album_views 从「每次打开插一行」改为 (user_id, album_id) 主键 + upsert，
 * 最近列表走 (user_id, viewed_at) 索引，不再全表 GROUP BY。
 * 旧数据每个图集只保留最后一次浏览，归属最早创建的管理员；全新库归属占位 id，首个管理员创建时认领。
 */
export const perUserAlbumViewsMigration = (db: Database.Database): void => {
  const owner = (db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined)?.id ?? LEGACY_PROGRESS_OWNER;
  db.exec(`
    CREATE TABLE album_views_v2 (
      user_id TEXT NOT NULL,
      album_id TEXT NOT NULL,
      viewed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, album_id)
    ) WITHOUT ROWID;
  `);
  db.prepare(`INSERT INTO album_views_v2 (user_id, album_id, viewed_at)
    SELECT ?, album_id, MAX(viewed_at) FROM album_views GROUP BY album_id`).run(owner);
  db.exec(`
    DROP TABLE album_views;
    ALTER TABLE album_views_v2 RENAME TO album_views;
    CREATE INDEX IF NOT EXISTS idx_album_views_user_viewed_at ON album_views (user_id, viewed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_album_views_album_id ON album_views (album_id);
  `);
};
