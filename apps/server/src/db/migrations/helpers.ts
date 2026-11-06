import type Database from "better-sqlite3";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const hasColumn = (db: Database.Database, table: string, column: string): boolean => {
  if (!IDENTIFIER.test(table)) throw new Error(`非法表名: ${table}`);
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((item) => item.name === column);
};

/** 列不存在时才追加；替代过去 try { ALTER } catch {} 吞掉一切错误的写法。 */
export const addColumnIfMissing = (db: Database.Database, table: string, column: string, definition: string): boolean => {
  if (!IDENTIFIER.test(column)) throw new Error(`非法列名: ${column}`);
  if (hasColumn(db, table, column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
};
