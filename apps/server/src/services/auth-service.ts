import crypto from "node:crypto";
import fs from "node:fs";

import { env } from "../config/env.js";
import { MAX_PASSWORD_LENGTH, validateAdminPassword } from "../config/security.js";
import { makeId } from "../repositories/ids.js";
import {
  countActiveAdminsDb, countUsersDb, deleteExpiredSessionsDb, deleteSessionDb, deleteUserDb, deleteUserSessionsDb,
  findFirstAdminDb, findSessionDb, findUserByIdDb, findUserByUsernameDb, insertSessionDb, insertUserDb, listUsersDb,
  updateUserDb, type UserRecord, type UserRole
} from "../repositories/user-repository.js";
import { nowIso } from "../lib/time.js";
import { SharePasswordService } from "./share-password.js";
import { claimLegacyProgressDb, deleteUserProgressDb } from "../repositories/album-progress-repository.js";
import { LEGACY_PROGRESS_OWNER } from "../db/migrations/0004-per-user-progress.js";

export const SESSION_TTL_SECONDS = 24 * 60 * 60;
export const DEFAULT_ADMIN_USERNAME = "admin";
const MAX_USERNAME_LENGTH = 64;
const USERNAME_PATTERN = /^[\p{L}\p{N}_.@-]+$/u;

/** 用户密码与分享密码共用 scrypt 参数和并发预算（最多 2 个活动、16 个排队）。 */
const hasher = new SharePasswordService();

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

export type PublicUser = { id: string; username: string; role: UserRole; disabled: boolean; createdAt: string; updatedAt: string };
export type ResolvedSession = { user: UserRecord; tokenHash: string; expiresAt: number };

export const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id, username: user.username, role: user.role, disabled: user.disabled, createdAt: user.createdAt, updatedAt: user.updatedAt
});

export const hashSessionToken = (token: string): string => crypto.createHash("sha256").update(token, "utf8").digest("hex");

const hashPasswordSync = (password: string): string => {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
};

export const validateUsername = (value: unknown): string => {
  const username = String(value ?? "").trim();
  if (!username || username.length > MAX_USERNAME_LENGTH || !USERNAME_PATTERN.test(username)) {
    throw httpError(400, `用户名需为 1-${MAX_USERNAME_LENGTH} 个字符，只能包含字母、数字、中文和 _ . @ -`);
  }
  return username;
};

export const validateUserPassword = (value: unknown): string => {
  const password = typeof value === "string" ? value : "";
  if (!password.length || password.length > MAX_PASSWORD_LENGTH) throw httpError(400, `密码长度必须为 1-${MAX_PASSWORD_LENGTH} 个字符`);
  return password;
};

/**
 * 启动时确保存在管理员：
 * - 数据库里还没有用户：ADMIN_PASSWORD 必填，用它创建 admin（只发生一次）；
 * - 已有用户：ADMIN_PASSWORD 可省略，页面上修改的密码为准；
 * - ADMIN_PASSWORD_RESET=true：用 ADMIN_PASSWORD 重置最早创建的管理员密码并吊销其全部会话（忘记密码时的救援通道）。
 * 数据库文件尚不存在且未配置密码时直接拒绝启动，不创建空库。
 */
export const ensureInitialAdmin = (adminPassword: string | undefined, options: { reset?: boolean } = {}): void => {
  if (adminPassword) validateAdminPassword(adminPassword);
  if (!adminPassword && !fs.existsSync(env.sqlitePath)) validateAdminPassword(adminPassword);
  if (countUsersDb() === 0) {
    const password = validateAdminPassword(adminPassword);
    const timestamp = nowIso();
    const id = makeId("user");
    insertUserDb({ id, username: DEFAULT_ADMIN_USERNAME, passwordHash: hashPasswordSync(password), role: "admin", disabled: false, createdAt: timestamp, updatedAt: timestamp });
    claimLegacyProgressDb(id, LEGACY_PROGRESS_OWNER);
    return;
  }
  if (options.reset) {
    const password = validateAdminPassword(adminPassword);
    const admin = findFirstAdminDb();
    if (!admin) return;
    updateUserDb(admin.id, { passwordHash: hashPasswordSync(password), disabled: false }, nowIso());
    deleteUserSessionsDb(admin.id);
  }
};

// 用户不存在时也做一次等价的哈希比较，避免通过响应时间探测用户名
const DUMMY_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

export const authenticate = async (usernameInput: unknown, passwordInput: unknown): Promise<UserRecord | null> => {
  const username = String(usernameInput ?? "").trim();
  const password = typeof passwordInput === "string" ? passwordInput : "";
  if (!username || username.length > MAX_USERNAME_LENGTH || !password || password.length > MAX_PASSWORD_LENGTH) return null;
  const user = findUserByUsernameDb(username);
  const valid = await hasher.verify(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || user.disabled) return null;
  return user;
};

export const createSession = (userId: string, userAgent?: string, ttlSeconds = SESSION_TTL_SECONDS): { token: string; expiresAt: number } => {
  deleteExpiredSessionsDb(Date.now());
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + ttlSeconds * 1000;
  insertSessionDb({ tokenHash: hashSessionToken(token), userId, expiresAt, createdAt: nowIso(), userAgent: userAgent?.slice(0, 256) ?? null });
  return { token, expiresAt };
};

export const resolveSession = (token: string | undefined, nowMs = Date.now()): ResolvedSession | null => {
  if (!token || token.length > 256) return null;
  const tokenHash = hashSessionToken(token);
  const session = findSessionDb(tokenHash);
  if (!session) return null;
  if (session.expiresAt <= nowMs) {
    deleteSessionDb(tokenHash);
    return null;
  }
  const user = findUserByIdDb(session.userId);
  if (!user || user.disabled) return null;
  return { user, tokenHash, expiresAt: session.expiresAt };
};

export const revokeSession = (token: string | undefined): void => {
  if (token) deleteSessionDb(hashSessionToken(token));
};

export const purgeExpiredSessions = (nowMs = Date.now()): number => deleteExpiredSessionsDb(nowMs);

/** 修改自己的用户名/密码：必须提供当前密码；改密后吊销本人其他会话。 */
export const updateOwnAccount = async (
  session: ResolvedSession,
  input: { currentPassword?: unknown; username?: unknown; newPassword?: unknown }
): Promise<PublicUser> => {
  const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
  if (!currentPassword || !(await hasher.verify(currentPassword.slice(0, MAX_PASSWORD_LENGTH + 1), session.user.passwordHash).catch(() => false))) {
    throw httpError(403, "当前密码不正确");
  }
  const patch: { username?: string; passwordHash?: string } = {};
  if (input.username !== undefined && input.username !== session.user.username) {
    const username = validateUsername(input.username);
    const existing = findUserByUsernameDb(username);
    if (existing && existing.id !== session.user.id) throw httpError(409, "用户名已被占用");
    patch.username = username;
  }
  if (input.newPassword !== undefined && input.newPassword !== "") {
    patch.passwordHash = await hasher.hash(validateUserPassword(input.newPassword));
  }
  if (!patch.username && !patch.passwordHash) throw httpError(400, "没有需要保存的修改");
  updateUserDb(session.user.id, patch, nowIso());
  if (patch.passwordHash) deleteUserSessionsDb(session.user.id, session.tokenHash);
  return toPublicUser(findUserByIdDb(session.user.id)!);
};

/* ---------- 管理员管理用户 ---------- */

export const listUsers = (): PublicUser[] => listUsersDb().map(toPublicUser);

const parseRole = (value: unknown): UserRole => {
  if (value === "admin" || value === "viewer") return value;
  throw httpError(400, "角色只能是 admin 或 viewer");
};

export const createUser = async (input: { username?: unknown; password?: unknown; role?: unknown }): Promise<PublicUser> => {
  const username = validateUsername(input.username);
  const password = validateUserPassword(input.password);
  const role = input.role === undefined ? "viewer" : parseRole(input.role);
  if (findUserByUsernameDb(username)) throw httpError(409, "用户名已被占用");
  const timestamp = nowIso();
  const user: UserRecord = { id: makeId("user"), username, passwordHash: await hasher.hash(password), role, disabled: false, createdAt: timestamp, updatedAt: timestamp };
  insertUserDb(user);
  return toPublicUser(user);
};

/** 保证系统里始终至少有一个可用的管理员。 */
const assertKeepsAdmin = (target: UserRecord, next: { role?: UserRole; disabled?: boolean; deleting?: boolean }) => {
  const losesAdmin = target.role === "admin" && !target.disabled && (next.deleting || next.disabled === true || (next.role !== undefined && next.role !== "admin"));
  if (losesAdmin && countActiveAdminsDb() <= 1) throw httpError(409, "至少需要保留一个可用的管理员");
};

export const updateUser = async (actor: UserRecord, userId: string, input: { username?: unknown; password?: unknown; role?: unknown; disabled?: unknown }): Promise<PublicUser> => {
  const target = findUserByIdDb(userId);
  if (!target) throw httpError(404, "用户不存在");
  const patch: Partial<Pick<UserRecord, "username" | "passwordHash" | "role" | "disabled">> = {};
  if (input.username !== undefined && input.username !== target.username) {
    const username = validateUsername(input.username);
    const existing = findUserByUsernameDb(username);
    if (existing && existing.id !== target.id) throw httpError(409, "用户名已被占用");
    patch.username = username;
  }
  if (input.role !== undefined) patch.role = parseRole(input.role);
  if (input.disabled !== undefined) patch.disabled = input.disabled === true;
  if (actor.id === target.id && (patch.disabled || (patch.role && patch.role !== "admin"))) throw httpError(409, "不能禁用自己或取消自己的管理员身份");
  assertKeepsAdmin(target, { role: patch.role, disabled: patch.disabled });
  if (input.password !== undefined && input.password !== "") patch.passwordHash = await hasher.hash(validateUserPassword(input.password));
  updateUserDb(target.id, patch, nowIso());
  if (patch.passwordHash || patch.disabled || patch.role) deleteUserSessionsDb(target.id);
  return toPublicUser(findUserByIdDb(target.id)!);
};

export const deleteUser = (actor: UserRecord, userId: string): void => {
  const target = findUserByIdDb(userId);
  if (!target) throw httpError(404, "用户不存在");
  if (actor.id === target.id) throw httpError(409, "不能删除自己");
  assertKeepsAdmin(target, { deleting: true });
  deleteUserProgressDb(target.id);
  deleteUserDb(target.id);
};
