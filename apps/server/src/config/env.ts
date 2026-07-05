import fs from "node:fs";
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
  host: process.env.HOST ?? "0.0.0.0",
  port: toNumber(process.env.PORT, 3001),
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin",
  libraryRootPath: libraryRootPaths[0],
  libraryRootPaths,
  cacheDir: process.env.CACHE_DIR ?? "./data/cache",
  indexFilePath: process.env.INDEX_FILE_PATH ?? "./data/index.json",
  sqlitePath: process.env.SQLITE_PATH ?? "./data/gallery.sqlite",
  publicDir: resolvePublicDir()
};
