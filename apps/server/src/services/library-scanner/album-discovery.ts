import fs from "node:fs";
import path from "node:path";

import { isSupportedImageExtension } from "../../lib/image-formats.js";
import { createLogger } from "../../lib/logger.js";
import { normalizeExtension, toPosixPath } from "../../lib/paths.js";
import { listAssetsByAlbumIdDb, listComparableFolderAssetsByLibraryRootDb, type ComparableAssetRecord } from "../../repositories/album-repository.js";
import type { AlbumRecord, SourceType } from "../../types/store.js";
import { isArchiveFile, listRootImageEntries } from "../archive.js";
import { mapWithConcurrency, sortNames } from "../library-scanner-utils.js";
import { headerDimensions } from "../thumbnail/header-dimensions.js";
import { probeImageHeader } from "../thumbnail/image-header-probe.js";
import { createSharp } from "../thumbnail/sharp-runtime.js";
import { normalizeMetadataDimensions } from "../thumbnail-options.js";

/**
 * 图集发现：遍历库目录，找出目录图集与压缩包图集并读取图片元数据。
 * 只读文件系统，不写数据库；写库与差异计算在 library-scanner.ts。
 */

const logger = createLogger("LibraryScanner");

export type ScannedAlbum = {
  name: string;
  sourceType: SourceType;
  sourcePath: string;
  sourceMtime: string;
  libraryRootPath: string;
  reuseExisting: boolean;
  reuseAssetCount: number;
  assets: Array<{
    name: string;
    extension: string;
    sourceType: SourceType;
    sourcePath: string;
    relativePath: string | null;
    zipEntryPath: string | null;
    sortIndex: number;
    sizeBytes: string | null;
    sourceMtime: string | null;
    width?: number | null;
    height?: number | null;
  }>;
};

/** 扫描期间已有资产的只读索引：整根预加载目录图集的比对列，scanFolderAlbum 与 shouldReplaceAlbum 共用；
 * 未预加载的图集（如 ZIP 指纹变化时）才回退到单图集查询。 */
export class ExistingAssetIndex {
  private readonly loaded: Map<string, ComparableAssetRecord[]>;
  constructor(preloaded?: Map<string, ComparableAssetRecord[]>, private readonly fallback: (albumId: string) => ComparableAssetRecord[] = listAssetsByAlbumIdDb) {
    this.loaded = preloaded ?? new Map();
  }

  static forLibraryRoot(libraryRootId: string, folderAlbumIds: Iterable<string>): ExistingAssetIndex {
    const grouped = listComparableFolderAssetsByLibraryRootDb(libraryRootId);
    // 没有资产的目录图集也标记为已加载，避免回退查询
    for (const albumId of folderAlbumIds) if (!grouped.has(albumId)) grouped.set(albumId, []);
    return new ExistingAssetIndex(grouped);
  }

  get(albumId: string): ComparableAssetRecord[] {
    let assets = this.loaded.get(albumId);
    if (!assets) {
      assets = this.fallback(albumId);
      this.loaded.set(albumId, assets);
    }
    return assets;
  }

  /** 图集处理完即释放，扫描大库时内存随进度下降。 */
  release(albumId: string): void {
    this.loaded.delete(albumId);
  }
}

/** 新文件尺寸：先读 128 KB 头部解析，解析不了（HEIC/AVIF/TIFF、头部过大等）才回退 sharp.metadata。 */
const readNewFileDimensions = async (fullPath: string, extension: string): Promise<{ width: number | null; height: number | null }> => {
  try {
    const header = await probeImageHeader({ sourceType: "folder", sourcePath: fullPath, zipEntryPath: null });
    if (header) return header;
  } catch {
    // 头部读取失败交给 sharp 判断（例如权限、特殊文件）
  }
  try {
    const dimensions = normalizeMetadataDimensions(await createSharp(fullPath).metadata());
    if (!dimensions.width || !dimensions.height) throw new Error("图片元数据不可用");
    return dimensions;
  } catch (error) {
    if (extension !== "bmp" || !(error instanceof Error) || !error.message.includes("unsupported image format")) throw error;
    return { width: null, height: null };
  }
};

export const scanFolderAlbum = async (
  libraryRootPath: string,
  folderPath: string,
  existingBySourcePath: Map<string, AlbumRecord>,
  existingAssetIndex: ExistingAssetIndex = new ExistingAssetIndex(),
  preReadEntries?: fs.Dirent[]
): Promise<ScannedAlbum | null> => {
  const folderStats = await fs.promises.stat(folderPath);
  const folderMtime = String(Math.trunc(folderStats.mtimeMs));

  const existingAlbum = existingBySourcePath.get(folderPath);
  const existingAssets = new Map((existingAlbum ? existingAssetIndex.get(existingAlbum.id) : []).map((asset) => [asset.sourcePath, asset]));
  const folderEntries = preReadEntries ?? await fs.promises.readdir(folderPath, { withFileTypes: true });
  const fileEntries = folderEntries.filter((entry) => !entry.isDirectory());
  const imageFiles = await mapWithConcurrency(fileEntries, 12, async (entry) => {
    const extension = normalizeExtension(entry.name);
    if (!isSupportedImageExtension(extension)) {
      return null;
    }
    const fullPath = path.join(folderPath, entry.name);
    const stats = await fs.promises.stat(fullPath);
    if (!stats.isFile()) {
      return null;
    }

    const existing = existingAssets.get(fullPath);
    const dimensions = existing?.width && existing.height && existing.sizeBytes === String(stats.size) && existing.sourceMtime === String(stats.mtimeMs)
      ? { width: existing.width, height: existing.height }
      : await readNewFileDimensions(fullPath, extension);

    return {
      name: entry.name,
      extension,
      sourceType: "folder" as const,
      sourcePath: fullPath,
      relativePath: toPosixPath(path.relative(libraryRootPath, fullPath)),
      zipEntryPath: null,
      sizeBytes: String(stats.size),
      sourceMtime: String(stats.mtimeMs),
      ...dimensions
    };
  });

  imageFiles.sort((left, right) => sortNames(left.name, right.name));
  if (imageFiles.length === 0) {
    return null;
  }

  return {
    name: path.basename(folderPath),
    sourceType: "folder",
    sourcePath: folderPath,
    sourceMtime: folderMtime,
    libraryRootPath,
    reuseExisting: false,
    reuseAssetCount: 0,
    assets: imageFiles.map((file, index) => ({
      ...file,
      sortIndex: index + 1
    }))
  };
};

/** 扫描是后台任务：ZIP 头部探测（单次打开、顺序读取）给更宽的期限，剩余的仍留到看图时补探。 */
export const SCAN_HEADER_PROBE_TIMEOUT_MS = 15_000;

export const scanZipAlbum = async (
  libraryRootPath: string,
  zipPath: string,
  existingBySourcePath: Map<string, AlbumRecord>,
  knownStats?: fs.Stats
): Promise<ScannedAlbum | null> => {
  const zipStats = knownStats ?? await fs.promises.stat(zipPath);
  const zipMtime = String(zipStats.mtimeMs);

  const existing = existingBySourcePath.get(zipPath);
  if (existing?.assetsFingerprint && existing.sourceMtime === zipMtime) {
    return {
      name: existing.name, sourceType: "zip", sourcePath: zipPath, sourceMtime: zipMtime,
      libraryRootPath, reuseExisting: true, reuseAssetCount: existing.assetCount, assets: []
    };
  }
  const entries = await listRootImageEntries(zipPath);
  if (entries.length === 0) {
    return null;
  }

  entries.sort((left, right) => sortNames(left.name, right.name));
  const dimensions = await headerDimensions.fill(entries.map((entry) => ({ sourceType: "zip", sourcePath: zipPath, zipEntryPath: entry.entryPath, sourceMtime: zipMtime, sizeBytes: String(entry.sizeBytes) })), SCAN_HEADER_PROBE_TIMEOUT_MS);

  return {
    name: path.basename(zipPath, path.extname(zipPath)),
    sourceType: "zip",
    sourcePath: zipPath,
    sourceMtime: zipMtime,
    libraryRootPath,
    reuseExisting: false,
    reuseAssetCount: 0,
    assets: entries.map((entry, index) => ({
      ...dimensions[index],
      name: entry.name,
      extension: entry.extension,
      sourceType: "zip" as const,
      sourcePath: zipPath,
      relativePath: null,
      zipEntryPath: entry.entryPath,
      sortIndex: index + 1,
      sizeBytes: String(entry.sizeBytes),
      sourceMtime: zipMtime
    }))
  };
};

/** 单次遍历：每个目录只 readdir 一次，同时产出目录图集与其中的归档图集，再按名称顺序递归子目录。 */
const iterateAlbumsRecursively = async function* (
  libraryRootPath: string,
  folderPath: string,
  existingBySourcePath: Map<string, AlbumRecord>,
  failedScopes: Set<string>,
  existingAssetIndex: ExistingAssetIndex
): AsyncGenerator<ScannedAlbum> {
  let folderEntries: fs.Dirent[];
  try {
    folderEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  } catch {
    failedScopes.add(folderPath);
    return;
  }

  try {
    const folderAlbum = await scanFolderAlbum(libraryRootPath, folderPath, existingBySourcePath, existingAssetIndex, folderEntries);
    if (folderAlbum) yield folderAlbum;
  } catch {
    failedScopes.add(folderPath);
  }

  const sortedEntries = [...folderEntries].sort((left, right) => sortNames(left.name, right.name));
  for (const entry of sortedEntries) {
    if (entry.isDirectory() || !(await isArchiveFile(entry.name))) continue;
    const fullPath = path.join(folderPath, entry.name);
    try {
      const stats = await fs.promises.stat(fullPath);
      if (!(await isArchiveFile(fullPath, stats))) continue;
      const archiveAlbum = await scanZipAlbum(libraryRootPath, fullPath, existingBySourcePath, stats);
      if (archiveAlbum) yield archiveAlbum;
    } catch {
      failedScopes.add(fullPath);
      logger.error("扫描归档失败，本轮保留已有索引");
    }
  }

  for (const directory of sortedEntries) {
    if (!directory.isDirectory()) continue;
    const childPath = path.join(folderPath, directory.name);
    for await (const childAlbum of iterateAlbumsRecursively(libraryRootPath, childPath, existingBySourcePath, failedScopes, existingAssetIndex)) {
      yield childAlbum;
    }
  }
};

export const iterateAlbumsForRoot = async function* (
  libraryRootPath: string,
  existingBySourcePath: Map<string, AlbumRecord>,
  failedScopes: Set<string>,
  existingAssetIndex: ExistingAssetIndex = new ExistingAssetIndex()
): AsyncGenerator<ScannedAlbum> {
  yield* iterateAlbumsRecursively(libraryRootPath, libraryRootPath, existingBySourcePath, failedScopes, existingAssetIndex);
};
