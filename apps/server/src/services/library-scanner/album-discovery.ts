import fs from "node:fs";
import path from "node:path";

import { isSupportedImageExtension } from "../../lib/image-formats.js";
import { createLogger } from "../../lib/logger.js";
import { normalizeExtension, toPosixPath } from "../../lib/paths.js";
import { listAssetsByAlbumIdDb } from "../../repositories/album-repository.js";
import type { AlbumRecord, SourceType } from "../../types/store.js";
import { isArchiveFile, listRootImageEntries } from "../archive.js";
import { mapWithConcurrency, sortNames } from "../library-scanner-utils.js";
import { headerDimensions } from "../thumbnail/header-dimensions.js";
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

export const scanFolderAlbum = async (
  libraryRootPath: string,
  folderPath: string,
  existingBySourcePath: Map<string, AlbumRecord>
): Promise<ScannedAlbum | null> => {
  const folderStats = await fs.promises.stat(folderPath);
  const folderMtime = String(Math.trunc(folderStats.mtimeMs));


  const existingAlbum = existingBySourcePath.get(folderPath);
  const existingAssets = new Map((existingAlbum ? listAssetsByAlbumIdDb(existingAlbum.id) : []).map((asset) => [asset.sourcePath, asset]));
  const folderEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
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

    let dimensions: { width: number | null; height: number | null };
    const existing = existingAssets.get(fullPath);
    if (existing?.width && existing.height && existing.sizeBytes === String(stats.size) && existing.sourceMtime === String(stats.mtimeMs)) {
      dimensions = { width: existing.width, height: existing.height };
    } else try {
      dimensions = normalizeMetadataDimensions(await createSharp(fullPath).metadata());
      if (!dimensions.width || !dimensions.height) throw new Error("图片元数据不可用");
    } catch (error) {
      if (extension !== "bmp" || !(error instanceof Error) || !error.message.includes("unsupported image format")) throw error;
      dimensions = { width: null, height: null };
    }

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

export const scanZipAlbum = async (
  libraryRootPath: string,
  zipPath: string,
  existingBySourcePath: Map<string, AlbumRecord>
): Promise<ScannedAlbum | null> => {
  const zipStats = await fs.promises.stat(zipPath);
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
  const dimensions = await headerDimensions.fill(entries.map((entry) => ({ sourceType: "zip", sourcePath: zipPath, zipEntryPath: entry.entryPath, sourceMtime: zipMtime, sizeBytes: String(entry.sizeBytes) })));

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

const iterateFolderAlbumsRecursively = async function* (
  libraryRootPath: string,
  folderPath: string,
  existingBySourcePath: Map<string, AlbumRecord>,
  failedScopes: Set<string>
): AsyncGenerator<ScannedAlbum> {
  let folderEntries: fs.Dirent[];
  try {
    folderEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  } catch {
    failedScopes.add(folderPath);
    return;
  }

  try {
    const folderAlbum = await scanFolderAlbum(libraryRootPath, folderPath, existingBySourcePath);
    if (folderAlbum) yield folderAlbum;
  } catch {
    failedScopes.add(folderPath);
  }

  const childDirectories = folderEntries.filter((entry) => entry.isDirectory()).sort((left, right) => sortNames(left.name, right.name));
  for (const directory of childDirectories) {
    const childPath = path.join(folderPath, directory.name);
    for await (const childAlbum of iterateFolderAlbumsRecursively(libraryRootPath, childPath, existingBySourcePath, failedScopes)) {
      yield childAlbum;
    }
  }
};

const iterateArchiveAlbumsRecursively = async function* (
  libraryRootPath: string,
  folderPath: string,
  existingBySourcePath: Map<string, AlbumRecord>,
  failedScopes: Set<string>
): AsyncGenerator<ScannedAlbum> {
  let folderEntries: fs.Dirent[];
  try {
    folderEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  } catch {
    failedScopes.add(folderPath);
    return;
  }

  const sortedEntries = [...folderEntries].sort((left, right) => sortNames(left.name, right.name));

  for (const entry of sortedEntries) {
    const fullPath = path.join(folderPath, entry.name);

    if (entry.isDirectory()) {
      for await (const childAlbum of iterateArchiveAlbumsRecursively(libraryRootPath, fullPath, existingBySourcePath, failedScopes)) {
        yield childAlbum;
      }
      continue;
    }

    if (!(await isArchiveFile(fullPath))) continue;
    try {
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        continue;
      }

      if (!(await isArchiveFile(fullPath, stats))) {
        continue;
      }

      const archiveAlbum = await scanZipAlbum(libraryRootPath, fullPath, existingBySourcePath);
      if (archiveAlbum) {
        yield archiveAlbum;
      }
    } catch (error) {
      failedScopes.add(fullPath);
      logger.error("扫描归档失败，本轮保留已有索引");
    }
  }
};

export const iterateAlbumsForRoot = async function* (
  libraryRootPath: string,
  existingBySourcePath: Map<string, AlbumRecord>,
  failedScopes: Set<string>
): AsyncGenerator<ScannedAlbum> {
  for await (const album of iterateFolderAlbumsRecursively(libraryRootPath, libraryRootPath, existingBySourcePath, failedScopes)) {
    yield album;
  }

  for await (const album of iterateArchiveAlbumsRecursively(libraryRootPath, libraryRootPath, existingBySourcePath, failedScopes)) {
    yield album;
  }
};
