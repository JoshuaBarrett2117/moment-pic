import type { UserRole } from "../repositories/user-repository.js";

/** viewer 也可以调用的写接口（只影响自己的账号/会话）。 */
const VIEWER_WRITABLE = new Set(["/api/v1/account", "/api/v1/auth/logout"]);
/** viewer 可写、且只影响自己数据的接口（阅读进度按用户隔离；浏览记录仅用于“最近浏览”；自定义背景按账号保存）。 */
const VIEWER_WRITABLE_PATTERNS = [/^\/api\/v1\/albums\/[^/]+\/progress$/, /^\/api\/v1\/albums\/[^/]+\/view$/, /^\/api\/v1\/account\/background$/];
/** 只有管理员可以读取的接口前缀。 */
const ADMIN_ONLY_READ_PREFIXES = ["/api/v1/users", "/api/v1/album-shares", "/api/v1/smart-album-ai-config"];

/**
 * 角色权限：admin 全部可用；viewer 只读浏览（相册、图片、目录、智能相册、继续阅读），
 * 不能扫描、改设置、管理分享、收藏或管理用户。
 */
export const isAllowedForRole = (role: UserRole, method: string, pathname: string): boolean => {
  if (role === "admin") return true;
  if (VIEWER_WRITABLE.has(pathname) || VIEWER_WRITABLE_PATTERNS.some((pattern) => pattern.test(pathname))) return true;
  if (method !== "GET" && method !== "HEAD") return false;
  return !ADMIN_ONLY_READ_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
};
