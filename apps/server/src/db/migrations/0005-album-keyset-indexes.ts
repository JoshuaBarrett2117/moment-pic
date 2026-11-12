import type Database from "better-sqlite3";

/**
 * 相册列表游标分页（user_version 4 → 5）：
 * 列表排序改为 `ORDER BY <col> <dir>, id <dir>`，键集条件为 `(col, id) </> (?, ?)`，
 * 因此各排序字段的复合索引以 id 作第二列，替换 0002 中以 name 作次序列的索引。
 *
 * 幂等：全部使用 IF NOT EXISTS / IF EXISTS，已有库重复执行（或索引已被手工建好）都不会失败。
 * 回滚：旧版本程序会忽略这些新索引；但旧版 runMigrations 会拒绝 user_version 高于自身的库，
 * 回退镜像前请先备份数据库（必要时恢复备份）。
 */
export const albumKeysetIndexesMigration = (db: Database.Database): void => {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_albums_updated_at_id ON albums (updated_at, id);
    CREATE INDEX IF NOT EXISTS idx_albums_name_id ON albums (name, id);
    CREATE INDEX IF NOT EXISTS idx_albums_asset_count_id ON albums (asset_count, id);
    CREATE INDEX IF NOT EXISTS idx_albums_favorite_updated_at_id ON albums (is_favorite, updated_at, id);
    CREATE INDEX IF NOT EXISTS idx_albums_root_updated_at_id ON albums (library_root_id, updated_at, id);

    DROP INDEX IF EXISTS idx_albums_updated_at_name;
    DROP INDEX IF EXISTS idx_albums_asset_count_name;
    DROP INDEX IF EXISTS idx_albums_favorite_updated_at;
  `);
};
