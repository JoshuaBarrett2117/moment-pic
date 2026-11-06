import type Database from "better-sqlite3";

/**
 * 相册列表性能（user_version 1 → 2）：
 * - 为各排序字段建复合索引，分页时走索引顺序而不是全表排序；
 * - albums_fts：FTS5 trigram 外部内容表，支持中文任意子串搜索（≥3 个字符走索引，更短的关键字回退 LIKE）。
 */
export const albumSearchIndexesMigration = (db: Database.Database): void => {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_albums_updated_at_name ON albums (updated_at, name);
    CREATE INDEX IF NOT EXISTS idx_albums_asset_count_name ON albums (asset_count, name);
    CREATE INDEX IF NOT EXISTS idx_albums_favorite_updated_at ON albums (is_favorite, updated_at);

    CREATE VIRTUAL TABLE IF NOT EXISTS albums_fts USING fts5(
      name,
      content = 'albums',
      content_rowid = 'rowid',
      tokenize = 'trigram'
    );

    CREATE TRIGGER IF NOT EXISTS albums_fts_after_insert AFTER INSERT ON albums BEGIN
      INSERT INTO albums_fts (rowid, name) VALUES (new.rowid, new.name);
    END;
    CREATE TRIGGER IF NOT EXISTS albums_fts_after_delete AFTER DELETE ON albums BEGIN
      INSERT INTO albums_fts (albums_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
    END;
    CREATE TRIGGER IF NOT EXISTS albums_fts_after_update_name AFTER UPDATE OF name ON albums BEGIN
      INSERT INTO albums_fts (albums_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
      INSERT INTO albums_fts (rowid, name) VALUES (new.rowid, new.name);
    END;

    INSERT INTO albums_fts (albums_fts) VALUES ('rebuild');
  `);
};
