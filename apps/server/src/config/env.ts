import fs from "node:fs";
import { resolveLogLevel } from "./log-level.js";
import path from "node:path";

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const splitLibraryRoots = (value: string | undefined): string[] => {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(/[\r\n;,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const libraryRootPaths = (() => {
  const roots = splitLibraryRoots(process.env.LIBRARY_ROOTS);
  if (roots.length > 0) {
    return roots;
  }

  return [process.env.LIBRARY_ROOT_PATH ?? "./samples/library"];
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
  port: toNumber(process.env.PORT, 3001),
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  trustedProxies: (process.env.TRUSTED_PROXIES ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  wsAllowedOrigins: (process.env.WS_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  libraryRootPath: libraryRootPaths[0],
  libraryRootPaths,
  cacheMaxBytes: Math.max(0, toNumber(process.env.CACHE_MAX_BYTES, 5 * 1024 ** 3)),
  cacheGcMinAgeHours: Math.max(0, toNumber(process.env.CACHE_GC_MIN_AGE_HOURS, 24)),
  cacheGcIntervalHours: Math.max(0, toNumber(process.env.CACHE_GC_INTERVAL_HOURS, 6)),
  cacheDir: process.env.CACHE_DIR ?? "./data/cache",
  indexFilePath: process.env.INDEX_FILE_PATH ?? "./data/index.json",
  sqlitePath: process.env.SQLITE_PATH ?? "./data/gallery.sqlite",
  publicDir: resolvePublicDir()
};
