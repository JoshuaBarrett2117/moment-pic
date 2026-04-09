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

export const env = {
  host: process.env.HOST ?? "0.0.0.0",
  port: toNumber(process.env.PORT, 3001),
  libraryRootPath: libraryRootPaths[0],
  libraryRootPaths,
  cacheDir: process.env.CACHE_DIR ?? "./data/cache",
  indexFilePath: process.env.INDEX_FILE_PATH ?? "./data/index.json",
  sqlitePath: process.env.SQLITE_PATH ?? "./data/gallery.sqlite"
};
