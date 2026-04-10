import fs from "node:fs";
import path from "node:path";

import { isSupportedImageExtension } from "../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../lib/paths.js";
import { nowIso } from "../lib/time.js";
import type { AlbumRecord, AssetRecord, LibraryRootRecord, SourceType } from "../types/store.js";
import {
  deleteAlbumDb,
  insertAlbumWithAssetsDb,
  listAlbumsByLibraryRootIdDb,
  listAlbumsDb,
  listAssetsByAlbumIdDb,
  listLibraryRootsDb,
  makeId,
  upsertLibraryRootDb
} from "./sqlite-store.js";
import { listRootImageEntries } from "./zip.js";

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
    if (!entry.isFile()) {
      continue;
    }

    const fullPath = path.join(folderPath, entry.name);
    const extension = normalizeExtension(entry.name);
    if (!isSupportedImageExtension(extension)) {
      continue;
    }

    const stats = await fs.promises.stat(fullPath);
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

const discoverFolderAlbumsRecursively = async (libraryRootPath: string, folderPath: string): Promise<ScannedAlbum[]> => {
  let folderEntries: fs.Dirent[];
  try {
    folderEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const albums: ScannedAlbum[] = [];
  const folderAlbum = await scanFolderAlbum(libraryRootPath, folderPath);
  if (folderAlbum) {
    albums.push(folderAlbum);
  }

  const childDirectories = folderEntries.filter((entry) => entry.isDirectory()).sort((left, right) => sortNames(left.name, right.name));
  for (const directory of childDirectories) {
    const childPath = path.join(folderPath, directory.name);
    const childAlbums = await discoverFolderAlbumsRecursively(libraryRootPath, childPath);
    if (childAlbums.length > 0) {
      albums.push(...childAlbums);
    }
  }

  return albums;
};

const discoverAlbumsForRoot = async (libraryRootPath: string): Promise<ScannedAlbum[]> => {
  let rootEntries: fs.Dirent[];
  try {
    rootEntries = await fs.promises.readdir(libraryRootPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const albums: ScannedAlbum[] = await discoverFolderAlbumsRecursively(libraryRootPath, libraryRootPath);
  for (const entry of rootEntries.filter((item) => item.isFile() && normalizeExtension(item.name) === "zip")) {
    const fullPath = path.join(libraryRootPath, entry.name);
    const zipAlbum = await scanZipAlbum(libraryRootPath, fullPath);
    if (zipAlbum) {
      albums.push(zipAlbum);
    }
  }

  albums.sort((left, right) => sortNames(left.name, right.name));
  return albums;
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
    const discoveredAlbums = await discoverAlbumsForRoot(libraryRoot.path);
    const existingAlbums = listAlbumsByLibraryRootIdDb(libraryRoot.id);
    const existingBySourcePath = new Map(existingAlbums.map((album) => [album.sourcePath, album]));
    const discoveredBySourcePath = new Map(discoveredAlbums.map((album) => [album.sourcePath, album]));

    albumsDiscovered += discoveredAlbums.length;
    assetsDiscovered += discoveredAlbums.reduce((total, album) => total + album.assets.length, 0);

    for (const existingAlbum of existingAlbums) {
      if (!discoveredBySourcePath.has(existingAlbum.sourcePath)) {
        deleteAlbumDb(existingAlbum.id);
      }
    }

    for (const discoveredAlbum of discoveredAlbums) {
      const existingAlbum = existingBySourcePath.get(discoveredAlbum.sourcePath);
      const albumId = existingAlbum?.id ?? makeId("alb");
      const assets = discoveredAlbum.assets.map((asset) => toAssetRecord(albumId, timestamp, asset));

      if (existingAlbum && !shouldReplaceAlbum(existingAlbum, discoveredAlbum, assets)) {
        continue;
      }

      if (existingAlbum) {
        deleteAlbumDb(existingAlbum.id);
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

      insertAlbumWithAssetsDb(album, assets);
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
