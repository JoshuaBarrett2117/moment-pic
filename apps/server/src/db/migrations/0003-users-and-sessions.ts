import type Database from "better-sqlite3";

/**
 * 用户与服务端会话（user_version 2 → 3）：
 * - users：账号保存在数据库，密码为 scrypt 哈希；role 预留给权限管理；
 * - user_sessions：只存会话 token 的 SHA-256，登出/改密即可精确吊销；
 * - app_secrets：服务端生成的随机密钥（如 AI token 加密密钥），不再用管理员密码派生。
 */
export const usersAndSessionsMigration = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at);

    CREATE TABLE IF NOT EXISTS app_secrets (
      name TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
};
