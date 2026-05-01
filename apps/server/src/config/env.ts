const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
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

export const env = {
  host: process.env.HOST ?? "0.0.0.0",
  port: toNumber(process.env.PORT, 3001),
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin",
  libraryRootPath: libraryRootPaths[0],
  libraryRootPaths,
  cacheDir: process.env.CACHE_DIR ?? "./data/cache",
  indexFilePath: process.env.INDEX_FILE_PATH ?? "./data/index.json",
  sqlitePath: process.env.SQLITE_PATH ?? "./data/gallery.sqlite",
  publicDir: process.env.PUBLIC_DIR ?? "./dist/public",
  storageProfile: process.env.STORAGE_PROFILE ?? "auto",
  databaseUrl: process.env.DATABASE_URL ?? `file:${process.env.SQLITE_PATH ?? "./data/gallery.sqlite"}`,
  redisUrl: process.env.REDIS_URL?.trim() || "",
  autoMigrateToPostgres: toBoolean(process.env.AUTO_MIGRATE_TO_POSTGRES, true),
  autoImportLegacyJson: toBoolean(process.env.AUTO_IMPORT_LEGACY_JSON, true),
  storageMigrationStrategy: process.env.STORAGE_MIGRATION_STRATEGY ?? "fail-fast"
};
