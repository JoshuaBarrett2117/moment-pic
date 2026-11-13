import type Database from "better-sqlite3";

/**
 * 旧版本按动画模式读取 GIF/WebP，入库高度是所有帧的总高。
 * 清空这两类资产的宽高，由扫描或列表时的头部探测重新填写（只读文件头，开销很小）。
 * 旧的逐帧长条缩略图由缓存键版本（thumbnail-options.ts 的 v6）失效，下次请求按单帧重新生成。
 */
export const resetAnimatedDimensionsMigration = (db: Database.Database) => {
  db.exec(`
    UPDATE assets
       SET width = NULL, height = NULL
     WHERE lower(name) LIKE '%.gif' OR lower(name) LIKE '%.webp';
  `);
};
