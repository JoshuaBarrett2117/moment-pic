import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { env } from "../config/env.js";
import { isSupportedImageExtension } from "../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../lib/paths.js";
import { nowIso } from "../lib/time.js";
import type { AlbumRecord, AssetRecord, LibraryRootRecord, SourceType } from "../types/store.js";
import {
  clearLibraryDataDb,
  findLibraryRootByPathDb,
  insertAlbumWithAssetsDb,
  listAlbumsDb,
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

const ensureLibraryRootPaths = async () => {
  await Promise.all(env.libraryRootPaths.map((rootPath) => fs.promises.mkdir(rootPath, { recursive: true })));
};

const sortNames = (left: string, right: string): number =>
  left.localeCompare(right, "zh-Hans-CN-u-kn-true");

const ensureLibraryRootRecord = (rootPath: string): LibraryRootRecord => {
  const existing = findLibraryRootByPathDb(rootPath);
  const timestamp = nowIso();

  if (existing) {
    const updated = {
      ...existing,
      enabled: true,
      updatedAt: timestamp
    };
    upsertLibraryRootDb(updated);
    return updated;
  }

  const created: LibraryRootRecord = {
    id: makeId("root"),
    name: path.basename(rootPath) || rootPath,
    path: rootPath,
    enabled: true,
    lastScannedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  upsertLibraryRootDb(created);
  return created;
};

const getScanRoots = async (): Promise<LibraryRootRecord[]> => {
  const dbRoots = listLibraryRootsDb().filter((root) => root.enabled);
  if (dbRoots.length > 0) {
    return dbRoots;
  }

  await ensureLibraryRootPaths();
  return env.libraryRootPaths.map((rootPath) => ensureLibraryRootRecord(rootPath));
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

const discoverAlbumsForRoot = async (libraryRootPath: string): Promise<ScannedAlbum[]> => {
  let rootEntries: fs.Dirent[];
  try {
    rootEntries = await fs.promises.readdir(libraryRootPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const albums: ScannedAlbum[] = [];

  for (const entry of rootEntries) {
    const fullPath = path.join(libraryRootPath, entry.name);

    if (entry.isDirectory()) {
      const folderAlbum = await scanFolderAlbum(libraryRootPath, fullPath);
      if (folderAlbum) {
        albums.push(folderAlbum);
      }
      continue;
    }

    if (entry.isFile() && normalizeExtension(entry.name) === "zip") {
      const zipAlbum = await scanZipAlbum(libraryRootPath, fullPath);
      if (zipAlbum) {
        albums.push(zipAlbum);
      }
    }
  }

  albums.sort((left, right) => sortNames(left.name, right.name));
  return albums;
};

export const scanLibrary = async () => {
  const libraryRoots = await getScanRoots();
  const timestamp = nowIso();

  for (const libraryRoot of libraryRoots) {
    clearLibraryDataDb(libraryRoot.id);
  }

  let albumsDiscovered = 0;
  let assetsDiscovered = 0;

  for (const libraryRoot of libraryRoots) {
    const discoveredAlbums = await discoverAlbumsForRoot(libraryRoot.path);
    albumsDiscovered += discoveredAlbums.length;

    for (const discoveredAlbum of discoveredAlbums) {
      const albumId = makeId("alb");
      const assets: AssetRecord[] = discoveredAlbum.assets.map((asset) => ({
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
      }));

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
        createdAt: timestamp,
        updatedAt: timestamp
      };

      insertAlbumWithAssetsDb(album, assets);
      assetsDiscovered += assets.length;
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
  await ensureLibraryRootPaths();
  env.libraryRootPaths.forEach((rootPath) => ensureLibraryRootRecord(rootPath));
  const existing = listAlbumsDb(1, 1);
  if (existing.total === 0) {
    await scanLibrary();
  }
};

export const listExistingLibraryRoots = () => listLibraryRootsDb();
