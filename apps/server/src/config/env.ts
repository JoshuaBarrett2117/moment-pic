import fs from "node:fs";
import { resolveLogLevel } from "./log-level.js";
import path from "node:path";

/** 生产 / Docker 默认端口；开发模式下服务端用 3211，由 Vite（3210）代理。 */
export const DEFAULT_PORT = 3210;

export class EnvConfigError extends Error {}

/** 已知环境变量。启动时对未知的 MOMENT_PIC 相关变量与已废弃变量给出提示。 */
export const KNOWN_ENV_KEYS = [
  "HOST", "PORT", "ADMIN_PASSWORD", "SESSION_SECRET", "TRUSTED_PROXIES", "WS_ALLOWED_ORIGINS",
  "LIBRARY_ROOTS", "CACHE_DIR", "CACHE_MAX_BYTES", "CACHE_GC_MIN_AGE_HOURS", "CACHE_GC_INTERVAL_HOURS",
  "SQLITE_PATH", "PUBLIC_DIR", "LOG_LEVEL", "AI_API_TOKEN", "ARCHIVE_EXTRACT_CACHE_MAX_BYTES"
] as const;

export const DEPRECATED_ENV_KEYS: Readonly<Record<string, string>> = {
  LIBRARY_ROOT_PATH: "请改用 LIBRARY_ROOTS（支持逗号/分号/换行分隔多个目录）",
  INDEX_FILE_PATH: "已不再使用，可删除",
  DATABASE_URL: "已不再使用（Prisma 已移除），数据库路径请用 SQLITE_PATH"
};

/** 数字型变量：未设置用默认值；设置了但非法则拒绝启动，而不是静默回退。 */
export const readNumber = (name: string, value: string | undefined, fallback: number, options: { min?: number; max?: number; integer?: boolean } = {}): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  const { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = options;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new EnvConfigError(`环境变量 ${name}=${JSON.stringify(value)} 非法，应为 ${integer ? "整数" : "数字"}，范围 ${min}-${max}`);
  }
  return parsed;
};

const splitList = (value: string | undefined, separator: RegExp): string[] =>
  (value ?? "").split(separator).map((item) => item.trim()).filter(Boolean);

const libraryRootPaths = (() => {
  const roots = splitList(process.env.LIBRARY_ROOTS, /[\r\n;,]+/);
  if (roots.length > 0) return roots;
  // 兼容旧变量，启动时会提示迁移
  return [process.env.LIBRARY_ROOT_PATH?.trim() || "./samples/library"];
})();

const resolvePublicDir = (): string => {
  if (process.env.PUBLIC_DIR?.trim()) {
    return process.env.PUBLIC_DIR;
  }

  const workspaceWebDist = path.resolve(process.cwd(), "../web/dist");
  if (fs.existsSync(path.join(workspaceWebDist, "index.html"))) {
    return workspaceWebDist;
  }

  return "./dist/public";
};

export const env = {
  logLevel: resolveLogLevel(process.env.LOG_LEVEL),
  host: process.env.HOST ?? "0.0.0.0",
  port: readNumber("PORT", process.env.PORT, DEFAULT_PORT, { min: 0, max: 65535, integer: true }), // 0 = 随机端口（测试用）
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  aiApiToken: process.env.AI_API_TOKEN ?? "",
  trustedProxies: splitList(process.env.TRUSTED_PROXIES, /,/),
  wsAllowedOrigins: splitList(process.env.WS_ALLOWED_ORIGINS, /,/),
  libraryRootPath: libraryRootPaths[0],
  libraryRootPaths,
  /** 是否显式配置了 LIBRARY_ROOTS / LIBRARY_ROOT_PATH；只有显式配置时才在启动时自动登记图库目录 */
  libraryRootsConfigured: splitList(process.env.LIBRARY_ROOTS, /[\r\n;,]+/).length > 0 || Boolean(process.env.LIBRARY_ROOT_PATH?.trim()),
  cacheMaxBytes: readNumber("CACHE_MAX_BYTES", process.env.CACHE_MAX_BYTES, 5 * 1024 ** 3),
  cacheGcMinAgeHours: readNumber("CACHE_GC_MIN_AGE_HOURS", process.env.CACHE_GC_MIN_AGE_HOURS, 24),
  cacheGcIntervalHours: readNumber("CACHE_GC_INTERVAL_HOURS", process.env.CACHE_GC_INTERVAL_HOURS, 6),
  cacheDir: process.env.CACHE_DIR ?? "./data/cache",
  /** 7z/RAR 整包解压缓存总上限（字节，位于 CACHE_DIR/archive-extract）；单包上限为其 1/4；0 关闭。 */
  archiveExtractCacheMaxBytes: readNumber("ARCHIVE_EXTRACT_CACHE_MAX_BYTES", process.env.ARCHIVE_EXTRACT_CACHE_MAX_BYTES, 2 * 1024 ** 3),
  sqlitePath: process.env.SQLITE_PATH ?? "./data/gallery.sqlite",
  publicDir: resolvePublicDir()
};

/** 返回需要提示给运维的配置警告（废弃变量）。 */
export const collectEnvWarnings = (source: NodeJS.ProcessEnv = process.env): string[] =>
  Object.entries(DEPRECATED_ENV_KEYS)
    .filter(([key]) => source[key] !== undefined && source[key] !== "")
    .map(([key, hint]) => `环境变量 ${key} 已废弃：${hint}`);
