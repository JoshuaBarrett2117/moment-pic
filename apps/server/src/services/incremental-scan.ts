import path from "node:path";
import { normalizeSourcePath } from "../lib/paths.js";
import { createLogger } from "../lib/logger.js";
import { listAlbumsByLibraryRootIdDb } from "../repositories/album-repository.js";
import { findLibraryRootByIdDb } from "../repositories/library-root-repository.js";
import { rescanAlbums, scanLibrary } from "./library-scanner.js";

export type ScanPathEvent = { type: "add" | "change" | "unlink" | "addDir" | "unlinkDir"; path: string };
const logger = createLogger("IncrementalScan");
const defaults = { listAlbums: listAlbumsByLibraryRootIdDb, findRoot: findLibraryRootByIdDb, rescanAlbums, scanLibrary };

/** null 表示事件集合溢出，保守地执行整根扫描。 */
export const runIncrementalLibraryScan = async (libraryRootId: string, events: ScanPathEvent[] | null, dependencies = defaults) => {
  const root = dependencies.findRoot(libraryRootId);
  if (!root || !events) return dependencies.scanLibrary({ libraryRootId });
  const rootPath = normalizeSourcePath(path.resolve(root.path));
  const albums = dependencies.listAlbums(libraryRootId);
  const byPath = new Map(albums.map((album) => [normalizeSourcePath(path.resolve(album.sourcePath)), album]));
  const ids = new Set<string>();
  for (const event of events) {
    const eventPath = normalizeSourcePath(path.resolve(rootPath, event.path));
    let album;
    if (event.type === "addDir" || event.type === "unlinkDir") {
      let candidate = eventPath;
      while (candidate === rootPath || candidate.startsWith(rootPath + path.sep)) {
        const match = byPath.get(candidate);
        if (match?.sourceType === "folder") { album = match; break; }
        if (candidate === rootPath) break;
        candidate = path.dirname(candidate);
      }
    } else {
      const folder = byPath.get(path.dirname(eventPath));
      const archive = byPath.get(eventPath);
      // 一个目录同时含散图和 ZIP 时，两者都受事件影响，归档不能被目录命中遮蔽。
      if (archive?.sourceType === "zip") {
        ids.add(archive.id);
        album = archive;
      }
      if (folder?.sourceType === "folder") { ids.add(folder.id); album = folder; }
      // 新归档必须被发现，不能因同目录有散图而漏掉。
      if (!archive && /\.(zip|cbz|cbr|rar|7z)$/i.test(eventPath)) album = undefined;
    }
    if (!album) {
      logger.warn("事件无法定位图集，回退整根扫描", { type: event.type, path: path.relative(rootPath, eventPath) });
      return dependencies.scanLibrary({ libraryRootId });
    }
    ids.add(album.id);
  }
  const result = await dependencies.rescanAlbums([...ids]);
  return { albumsDiscovered: result.rescanned, assetsDiscovered: dependencies.listAlbums(libraryRootId).filter((album) => ids.has(album.id)).reduce((count, album) => count + album.assetCount, 0),
    failureCount: result.failed, outcome: result.failed ? "partial" : "complete", message: result.failed ? "部分扫描失败，已保留旧索引" : null };
};
