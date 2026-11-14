import { getDb, stmt } from "../db/sqlite.js";

export type UserRole = "admin" | "viewer";

export type UserRecord = {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SessionRecord = {
  tokenHash: string;
  userId: string;
  expiresAt: number;
  createdAt: string;
  userAgent: string | null;
};

const rowToUser = (row: Record<string, unknown>): UserRecord => ({
  id: String(row.id),
  username: String(row.username),
  passwordHash: String(row.password_hash),
  role: row.role === "viewer" ? "viewer" : "admin",
  disabled: Number(row.disabled) === 1,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToSession = (row: Record<string, unknown>): SessionRecord => ({
  tokenHash: String(row.token_hash),
  userId: String(row.user_id),
  expiresAt: Number(row.expires_at),
  createdAt: String(row.created_at),
  userAgent: row.user_agent === null || row.user_agent === undefined ? null : String(row.user_agent)
});

export const countUsersDb = (): number => (getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;

export const countActiveAdminsDb = (): number =>
  (getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get() as { n: number }).n;

export const listUsersDb = (): UserRecord[] =>
  getDb().prepare("SELECT * FROM users ORDER BY created_at ASC, username ASC").all().map((row) => rowToUser(row as Record<string, unknown>));

export const findUserByIdDb = (id: string): UserRecord | null => {
  const row = stmt("SELECT * FROM users WHERE id = ? LIMIT 1").get(id) as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : null;
};

export const findUserByUsernameDb = (username: string): UserRecord | null => {
  const row = getDb().prepare("SELECT * FROM users WHERE username = ? LIMIT 1").get(username) as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : null;
};

export const findFirstAdminDb = (): UserRecord | null => {
  const row = getDb().prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get() as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : null;
};

export const insertUserDb = (user: UserRecord): void => {
  getDb().prepare(`
    INSERT INTO users (id, username, password_hash, role, disabled, created_at, updated_at)
    VALUES (@id, @username, @passwordHash, @role, @disabled, @createdAt, @updatedAt)
  `).run({ ...user, disabled: user.disabled ? 1 : 0 });
};

export const updateUserDb = (id: string, patch: Partial<Pick<UserRecord, "username" | "passwordHash" | "role" | "disabled">>, updatedAt: string): void => {
  const current = findUserByIdDb(id);
  if (!current) return;
  const next = { ...current, ...patch };
  getDb().prepare(`
    UPDATE users SET username = @username, password_hash = @passwordHash, role = @role, disabled = @disabled, updated_at = @updatedAt WHERE id = @id
  `).run({ id, username: next.username, passwordHash: next.passwordHash, role: next.role, disabled: next.disabled ? 1 : 0, updatedAt });
};

export const deleteUserDb = (id: string): void => {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  })();
};

export const insertSessionDb = (session: SessionRecord): void => {
  getDb().prepare(`
    INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at, user_agent)
    VALUES (@tokenHash, @userId, @expiresAt, @createdAt, @userAgent)
  `).run(session);
};

export const findSessionDb = (tokenHash: string): SessionRecord | null => {
  const row = stmt("SELECT * FROM user_sessions WHERE token_hash = ? LIMIT 1").get(tokenHash) as Record<string, unknown> | undefined;
  return row ? rowToSession(row) : null;
};

export const deleteSessionDb = (tokenHash: string): void => {
  getDb().prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(tokenHash);
};

export const deleteUserSessionsDb = (userId: string, exceptTokenHash?: string): number =>
  getDb().prepare("DELETE FROM user_sessions WHERE user_id = ? AND token_hash != ?").run(userId, exceptTokenHash ?? "").changes;

export const deleteExpiredSessionsDb = (nowMs: number): number =>
  getDb().prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(nowMs).changes;

export const getAppSecretDb = (name: string): string | null => {
  const row = getDb().prepare("SELECT value FROM app_secrets WHERE name = ?").get(name) as { value: string } | undefined;
  return row?.value ?? null;
};

export const insertAppSecretIfMissingDb = (name: string, value: string, createdAt: string): string => {
  getDb().prepare("INSERT OR IGNORE INTO app_secrets (name, value, created_at) VALUES (?, ?, ?)").run(name, value, createdAt);
  return getAppSecretDb(name) ?? value;
};
