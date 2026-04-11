import fs from "node:fs";
import path from "node:path";

import { isSupportedImageExtension } from "../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../lib/paths.js";
import { nowIso } from "../lib/time.js";
import type { AlbumRecord, AssetRecord, LibraryRootRecord, SourceType } from "../types/store.js";
import {
  applyLibraryRootScanDiffDb,
  listAlbumsByLibraryRootIdDb,
  listAlbumsDb,
  listAssetsByAlbumIdDb,
  listLibraryRootsDb,
  makeId,
  upsertLibraryRootDb
} from "./sqlite-store.js";
import { isArchiveFile, listRootImageEntries } from "./archive.js";

type ScannedAlbum = {
  name: string;
  sourceType: SourceType;
  sourcePath: string;
  sourceMtime: string;
  libraryRootPath: string;
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
  }>;
};

export class ScanLibraryRootNotFoundError extends Error {
  constructor(rootId: string) {
    super(`library root not found: ${rootId}`);
    this.name = "ScanLibraryRootNotFoundError";
  }
}

type ScanLibraryInput = {
  libraryRootId?: string;
};

const sortNames = (left: string, right: string): number =>
  left.localeCompare(right, "zh-Hans-CN-u-kn-true");

const getScanRoots = async (input?: ScanLibraryInput): Promise<LibraryRootRecord[]> => {
  const enabledRoots = listLibraryRootsDb().filter((root) => root.enabled);
  if (!input?.libraryRootId) {
    return enabledRoots;
  }

  return enabledRoots.filter((root) => root.id === input.libraryRootId);
};

const scanFolderAlbum = async (libraryRootPath: string, folderPath: string): Promise<ScannedAlbum | null> => {
  const folderEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  const imageFiles = [];

  for (const entry of folderEntries) {
    if (entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(folderPath, entry.name);
    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(fullPath);
    } catch {
      continue;
    }
    if (!stats.isFile()) {
      continue;
    }

    const extension = normalizeExtension(entry.name);
    if (!isSupportedImageExtension(extension)) {
      continue;
    }

    imageFiles.push({
      name: entry.name,
      extension,
      sourceType: "folder" as const,
      sourcePath: fullPath,
      relativePath: toPosixPath(path.relative(libraryRootPath, fullPath)),
      zipEntryPath: null,
      sizeBytes: String(stats.size),
      sourceMtime: String(Math.trunc(stats.mtimeMs))
    });
  }

  imageFiles.sort((left, right) => sortNames(left.name, right.name));
  if (imageFiles.length === 0) {
    return null;
  }

  const stats = await fs.promises.stat(folderPath);
  return {
    name: path.basename(folderPath),
    sourceType: "folder",
    sourcePath: folderPath,
    sourceMtime: String(Math.trunc(stats.mtimeMs)),
    libraryRootPath,
    assets: imageFiles.map((file, index) => ({
      ...file,
      sortIndex: index + 1
    }))
  };
};

const scanZipAlbum = async (libraryRootPath: string, zipPath: string): Promise<ScannedAlbum | null> => {
  const entries = await listRootImageEntries(zipPath);
  if (entries.length === 0) {
    return null;
  }

  entries.sort((left, right) => sortNames(left.name, right.name));
  const stats = await fs.promises.stat(zipPath);

  return {
    name: path.basename(zipPath, path.extname(zipPath)),
    sourceType: "zip",
    sourcePath: zipPath,
    sourceMtime: String(Math.trunc(stats.mtimeMs)),
    libraryRootPath,
    assets: entries.map((entry, index) => ({
      name: entry.name,
      extension: entry.extension,
      sourceType: "zip" as const,
      sourcePath: zipPath,
      relativePath: null,
      zipEntryPath: entry.entryPath,
      sortIndex: index + 1,
      sizeBytes: String(entry.sizeBytes),
      sourceMtime: String(Math.trunc(stats.mtimeMs))
    }))
  };
};

const iterateFolderAlbumsRecursively = async function* (
  libraryRootPath: string,
  folderPath: string
): AsyncGenerator<ScannedAlbum> {
  let folderEntries: fs.Dirent[];
  try {
    folderEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  } catch {
    return;
  }

  const folderAlbum = await scanFolderAlbum(libraryRootPath, folderPath);
  if (folderAlbum) {
    yield folderAlbum;
  }

  const childDirectories = folderEntries.filter((entry) => entry.isDirectory()).sort((left, right) => sortNames(left.name, right.name));
  for (const directory of childDirectories) {
    const childPath = path.join(folderPath, directory.name);
    for await (const childAlbum of iterateFolderAlbumsRecursively(libraryRootPath, childPath)) {
      yield childAlbum;
    }
  }
};

const iterateArchiveAlbumsRecursively = async function* (
  libraryRootPath: string,
  folderPath: string
): AsyncGenerator<ScannedAlbum> {
  let folderEntries: fs.Dirent[];
  try {
    folderEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  } catch {
    return;
  }

  const sortedEntries = [...folderEntries].sort((left, right) => sortNames(left.name, right.name));

  for (const entry of sortedEntries) {
    const fullPath = path.join(folderPath, entry.name);

    if (entry.isDirectory()) {
      for await (const childAlbum of iterateArchiveAlbumsRecursively(libraryRootPath, fullPath)) {
        yield childAlbum;
      }
      continue;
    }

    try {
      const stats = await fs.promises.stat(fullPath);
      if (!stats.isFile()) {
        continue;
      }

      if (!(await isArchiveFile(fullPath))) {
        continue;
      }

      const archiveAlbum = await scanZipAlbum(libraryRootPath, fullPath);
      if (archiveAlbum) {
        yield archiveAlbum;
      }
    } catch (error) {
      console.error(
        `scan archive failed: ${fullPath}`,
        error instanceof Error ? error.message : error
      );
    }
  }
};

const iterateAlbumsForRoot = async function* (libraryRootPath: string): AsyncGenerator<ScannedAlbum> {
  for await (const album of iterateFolderAlbumsRecursively(libraryRootPath, libraryRootPath)) {
    yield album;
  }

  for await (const album of iterateArchiveAlbumsRecursively(libraryRootPath, libraryRootPath)) {
    yield album;
  }
};

const toAssetRecord = (albumId: string, timestamp: string, asset: ScannedAlbum["assets"][number]): AssetRecord => ({
  id: makeId("ast"),
  albumId,
  name: asset.name,
  extension: asset.extension,
  sourceType: asset.sourceType,
  sourcePath: asset.sourcePath,
  relativePath: asset.relativePath,
  zipEntryPath: asset.zipEntryPath,
  sortIndex: asset.sortIndex,
  width: null,
  height: null,
  sizeBytes: asset.sizeBytes,
  sourceMtime: asset.sourceMtime,
  thumbnailKey: null,
  createdAt: timestamp,
  updatedAt: timestamp
});

const shouldReplaceAlbum = (existingAlbum: AlbumRecord, discoveredAlbum: ScannedAlbum, nextAssets: AssetRecord[]): boolean => {
  if (
    existingAlbum.name !== discoveredAlbum.name ||
    existingAlbum.sourceType !== discoveredAlbum.sourceType ||
    existingAlbum.sourceMtime !== discoveredAlbum.sourceMtime ||
    existingAlbum.assetCount !== nextAssets.length
  ) {
    return true;
  }

  const existingAssets = listAssetsByAlbumIdDb(existingAlbum.id);
  if (existingAssets.length !== nextAssets.length) {
    return true;
  }

  for (let index = 0; index < existingAssets.length; index += 1) {
    const current = existingAssets[index];
    const next = nextAssets[index];
    if (
      current.name !== next.name ||
      current.extension !== next.extension ||
      current.relativePath !== next.relativePath ||
      current.zipEntryPath !== next.zipEntryPath ||
      current.sortIndex !== next.sortIndex ||
      current.sizeBytes !== next.sizeBytes ||
      current.sourceMtime !== next.sourceMtime
    ) {
      return true;
    }
  }

  return false;
};

export const scanLibrary = async (input?: ScanLibraryInput) => {
  const libraryRoots = await getScanRoots(input);
  if (input?.libraryRootId && libraryRoots.length === 0) {
    throw new ScanLibraryRootNotFoundError(input.libraryRootId);
  }

  const timestamp = nowIso();
  let albumsDiscovered = 0;
  let assetsDiscovered = 0;

  for (const libraryRoot of libraryRoots) {
    const existingAlbums = listAlbumsByLibraryRootIdDb(libraryRoot.id);
    const existingBySourcePath = new Map(existingAlbums.map((album) => [album.sourcePath, album]));
    const discoveredSourcePaths = new Set<string>();

    for await (const discoveredAlbum of iterateAlbumsForRoot(libraryRoot.path)) {
      discoveredSourcePaths.add(discoveredAlbum.sourcePath);
      albumsDiscovered += 1;
      assetsDiscovered += discoveredAlbum.assets.length;

      const existingAlbum = existingBySourcePath.get(discoveredAlbum.sourcePath);
      const albumId = existingAlbum?.id ?? makeId("alb");
      const assets = discoveredAlbum.assets.map((asset) => toAssetRecord(albumId, timestamp, asset));

      if (existingAlbum && !shouldReplaceAlbum(existingAlbum, discoveredAlbum, assets)) {
        continue;
      }

      const album: AlbumRecord = {
        id: albumId,
        libraryRootId: libraryRoot.id,
        name: discoveredAlbum.name,
        sourceType: discoveredAlbum.sourceType,
        sourcePath: discoveredAlbum.sourcePath,
        sourceMtime: discoveredAlbum.sourceMtime,
        coverAssetId: assets[0]?.id ?? null,
        assetCount: assets.length,
        scanStatus: "ready",
        errorMessage: null,
        createdAt: existingAlbum?.createdAt ?? timestamp,
        updatedAt: timestamp
      };

      applyLibraryRootScanDiffDb({
        removedAlbumIds: [],
        replacedAlbums: [
          {
            existingAlbumId: existingAlbum?.id ?? null,
            album,
            assets
          }
        ]
      });
    }

    const removedAlbumIds = existingAlbums
      .filter((album) => !discoveredSourcePaths.has(album.sourcePath))
      .map((album) => album.id);
    if (removedAlbumIds.length > 0) {
      applyLibraryRootScanDiffDb({
        removedAlbumIds,
        replacedAlbums: []
      });
    }

    upsertLibraryRootDb({
      ...libraryRoot,
      lastScannedAt: timestamp,
      updatedAt: timestamp
    });
  }

  return {
    albumsDiscovered,
    assetsDiscovered
  };
};

export const ensureScannedLibrary = async () => {
  const existingRoots = listLibraryRootsDb();
  if (existingRoots.length === 0) {
    return;
  }

  const existing = listAlbumsDb(1, 1);
  if (existing.total > 0) {
    return;
  }

  await scanLibrary();
};

export const listExistingLibraryRoots = () => listLibraryRootsDb();
