import { env } from "../config/env.js";
import { AUTH_COOKIE_NAME } from "../lib/auth.js";
import { findFirstAdminDb } from "../repositories/user-repository.js";
import { createSession, ensureInitialAdmin } from "../services/auth-service.js";

/** 测试用：为（必要时自动创建的）管理员签发真实服务端会话，返回 Cookie 请求头值。 */
export const testSessionCookie = (ttlMs = 60_000): string => {
  ensureInitialAdmin(env.adminPassword);
  const admin = findFirstAdminDb();
  if (!admin) throw new Error("测试管理员不存在");
  const { token } = createSession(admin.id, "test", ttlMs / 1000);
  return `${AUTH_COOKIE_NAME}=${token}`;
};
