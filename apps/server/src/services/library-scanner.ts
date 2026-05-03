import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { isSupportedImageExtension } from "../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../lib/paths.js";
import { nowIso } from "../lib/time.js";
import type { AlbumRecord, AssetRecord, LibraryRootRecord, SourceType } from "../types/store.js";
import {
  applyLibraryRootScanDiffDb,
  findAlbumByIdDb,
  listAlbumsDb,
  listAssetsByAlbumIdDb,
  updateAlbumScanMetadataDb,
  listAlbumsByLibraryRootIdDb
} from "../repositories/album-repository.js";
import { findLibraryRootByIdDb, listLibraryRootsDb, upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import { makeId } from "../repositories/ids.js";
import { isArchiveFile, listRootImageEntries } from "./archive.js";
import { rebuildSmartAlbums } from "./smart-album-service.js";

type ScannedAlbum = {
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
  }>;
};

export class ScanLibraryRootNotFoundError extends Error {
  constructor(rootId: string) {
    super(`library root not found: ${rootId}`);
    this.name = "ScanLibraryRootNotFoundError";
  }
}

export class ScanAlbumNotFoundError extends Error {
  constructor(albumId: string) {
    super(`album not found: ${albumId}`);
    this.name = "ScanAlbumNotFoundError";
  }
}

export class ScanAlbumSourceInvalidError extends Error {
  constructor(albumId: string, sourcePath: string) {
    super(`album source invalid: ${albumId} -> ${sourcePath}`);
    this.name = "ScanAlbumSourceInvalidError";
  }
}

type ScanLibraryInput = {
  libraryRootId?: string;
  batchSize?: number;
  onProgress?: (progress: {
    libraryRootId: string;
    albumsDiscovered: number;
    assetsDiscovered: number;
    scannedAlbumsInRoot: number;
    rootIndex: number;
    totalRoots: number;
  }) => void;
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R | null>
): Promise<R[]> => {
  const safeConcurrency = Math.max(1, Math.min(concurrency, 32));
  const results: Array<R | null> = new Array(items.length).fill(null);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await mapper(items[index]);
      } catch {
        results[index] = null;
      }
    }
  };

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results.filter((item): item is R => item !== null);
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

const scanFolderAlbum = async (
  libraryRootPath: string,
  folderPath: string,
  existingBySourcePath: Map<string, AlbumRecord>
): Promise<ScannedAlbum | null> => {
  const folderStats = await fs.promises.stat(folderPath);
  const folderMtime = String(Math.trunc(folderStats.mtimeMs));
  const existingAlbum = existingBySourcePath.get(folderPath);
  if (existingAlbum && existingAlbum.sourceMtime === folderMtime) {
    return {
      name: existingAlbum.name,
      sourceType: existingAlbum.sourceType,
      sourcePath: folderPath,
      sourceMtime: folderMtime,
      libraryRootPath,
      reuseExisting: true,
      reuseAssetCount: existingAlbum.assetCount,
      assets: []
    };
  }

  const folderEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  const fileEntries = folderEntries.filter((entry) => !entry.isDirectory());
  const imageFiles = await mapWithConcurrency(fileEntries, 12, async (entry) => {
    const fullPath = path.join(folderPath, entry.name);
    const stats = await fs.promises.stat(fullPath);
    if (!stats.isFile()) {
      return null;
    }

    const extension = normalizeExtension(entry.name);
    if (!isSupportedImageExtension(extension)) {
      return null;
    }

    return {
      name: entry.name,
      extension,
      sourceType: "folder" as const,
      sourcePath: fullPath,
      relativePath: toPosixPath(path.relative(libraryRootPath, fullPath)),
      zipEntryPath: null,
      sizeBytes: String(stats.size),
      sourceMtime: String(Math.trunc(stats.mtimeMs))
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

const scanZipAlbum = async (
  libraryRootPath: string,
  zipPath: string,
  existingBySourcePath: Map<string, AlbumRecord>
): Promise<ScannedAlbum | null> => {
  const zipStats = await fs.promises.stat(zipPath);
  const zipMtime = String(Math.trunc(zipStats.mtimeMs));
  const existingAlbum = existingBySourcePath.get(zipPath);
  if (existingAlbum && existingAlbum.sourceMtime === zipMtime) {
    return {
      name: existingAlbum.name,
      sourceType: existingAlbum.sourceType,
      sourcePath: zipPath,
      sourceMtime: zipMtime,
      libraryRootPath,
      reuseExisting: true,
      reuseAssetCount: existingAlbum.assetCount,
      assets: []
    };
  }

  const entries = await listRootImageEntries(zipPath);
  if (entries.length === 0) {
    return null;
  }

  entries.sort((left, right) => sortNames(left.name, right.name));

  return {
    name: path.basename(zipPath, path.extname(zipPath)),
    sourceType: "zip",
    sourcePath: zipPath,
    sourceMtime: zipMtime,
    libraryRootPath,
    reuseExisting: false,
    reuseAssetCount: 0,
    assets: entries.map((entry, index) => ({
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
  existingBySourcePath: Map<string, AlbumRecord>
): AsyncGenerator<ScannedAlbum> {
  let folderEntries: fs.Dirent[];
  try {
    folderEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  } catch {
    return;
  }

  const folderAlbum = await scanFolderAlbum(libraryRootPath, folderPath, existingBySourcePath);
  if (folderAlbum) {
    yield folderAlbum;
  }

  const childDirectories = folderEntries.filter((entry) => entry.isDirectory()).sort((left, right) => sortNames(left.name, right.name));
  for (const directory of childDirectories) {
    const childPath = path.join(folderPath, directory.name);
    for await (const childAlbum of iterateFolderAlbumsRecursively(libraryRootPath, childPath, existingBySourcePath)) {
      yield childAlbum;
    }
  }
};

const iterateArchiveAlbumsRecursively = async function* (
  libraryRootPath: string,
  folderPath: string,
  existingBySourcePath: Map<string, AlbumRecord>
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
      for await (const childAlbum of iterateArchiveAlbumsRecursively(libraryRootPath, fullPath, existingBySourcePath)) {
        yield childAlbum;
      }
      continue;
    }

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
      console.error(
        `scan archive failed: ${fullPath}`,
        error instanceof Error ? error.message : error
      );
    }
  }
};

const iterateAlbumsForRoot = async function* (
  libraryRootPath: string,
  existingBySourcePath: Map<string, AlbumRecord>
): AsyncGenerator<ScannedAlbum> {
  for await (const album of iterateFolderAlbumsRecursively(libraryRootPath, libraryRootPath, existingBySourcePath)) {
    yield album;
  }

  for await (const album of iterateArchiveAlbumsRecursively(libraryRootPath, libraryRootPath, existingBySourcePath)) {
    yield album;
  }
};

const toAssetRecord = (albumId: string, timestamp: string, asset: ScannedAlbum["assets"][number]): AssetRecord => ({
  id: buildStableAssetId(asset),
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

const buildAssetsFingerprint = (assets: ScannedAlbum["assets"]): string =>
  crypto
    .createHash("sha1")
    .update(
      assets
        .map((asset) =>
          [
            asset.name,
            asset.extension,
            asset.relativePath ?? "",
            asset.zipEntryPath ?? "",
            String(asset.sortIndex),
            asset.sizeBytes ?? "",
            asset.sourceMtime ?? ""
          ].join("|")
        )
        .join("\n")
    )
    .digest("hex");

export const buildStableAssetId = (asset: {
  sourceType: SourceType;
  sourcePath: string;
  zipEntryPath: string | null;
}): string => {
  const hash = crypto
    .createHash("sha1")
    .update([asset.sourceType, asset.sourcePath, asset.zipEntryPath ?? ""].join("|"))
    .digest("hex");

  return `ast_${hash.slice(0, 32)}`;
};

const shouldReplaceAlbum = (
  existingAlbum: AlbumRecord,
  discoveredAlbum: ScannedAlbum,
  nextAssets: AssetRecord[]
): boolean => {
  if (discoveredAlbum.reuseExisting) {
    return false;
  }

  if (
    existingAlbum.name !== discoveredAlbum.name ||
    existingAlbum.sourceType !== discoveredAlbum.sourceType ||
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
  const batchSize = Math.max(1, Math.min(input?.batchSize ?? 16, 128));
  let albumsDiscovered = 0;
  let assetsDiscovered = 0;
  const totalRoots = libraryRoots.length;

  for (let rootIndex = 0; rootIndex < libraryRoots.length; rootIndex += 1) {
    const libraryRoot = libraryRoots[rootIndex];
    const existingAlbums = listAlbumsByLibraryRootIdDb(libraryRoot.id);
    const existingBySourcePath = new Map(existingAlbums.map((album) => [album.sourcePath, album]));
    const discoveredSourcePaths = new Set<string>();
    const replacedBatch: Array<{
      existingAlbumId: string | null;
      album: AlbumRecord;
      assets: AssetRecord[];
    }> = [];
    let scannedAlbumsInRoot = 0;
    let lastProgressAt = Date.now();

    if (input?.onProgress) {
      input.onProgress({
        libraryRootId: libraryRoot.id,
        albumsDiscovered,
        assetsDiscovered,
        scannedAlbumsInRoot,
        rootIndex: rootIndex + 1,
        totalRoots
      });
    }

    const flushBatch = () => {
      if (replacedBatch.length === 0) {
        return;
      }
      applyLibraryRootScanDiffDb({
        removedAlbumIds: [],
        replacedAlbums: replacedBatch.splice(0, replacedBatch.length)
      });
    };

    for await (const discoveredAlbum of iterateAlbumsForRoot(libraryRoot.path, existingBySourcePath)) {
      scannedAlbumsInRoot += 1;
      discoveredSourcePaths.add(discoveredAlbum.sourcePath);
      albumsDiscovered += 1;
      assetsDiscovered += discoveredAlbum.reuseExisting ? discoveredAlbum.reuseAssetCount : discoveredAlbum.assets.length;

      const existingAlbum = existingBySourcePath.get(discoveredAlbum.sourcePath);
      if (discoveredAlbum.reuseExisting && existingAlbum) {
        continue;
      }
      const albumId = existingAlbum?.id ?? makeId("alb");
      const assets = discoveredAlbum.assets.map((asset) => toAssetRecord(albumId, timestamp, asset));
      const assetsFingerprint = buildAssetsFingerprint(discoveredAlbum.assets);

      if (
        existingAlbum &&
        existingAlbum.name === discoveredAlbum.name &&
        existingAlbum.sourceType === discoveredAlbum.sourceType &&
        existingAlbum.assetCount === assets.length &&
        existingAlbum.assetsFingerprint === assetsFingerprint
      ) {
        if (existingAlbum.sourceMtime !== discoveredAlbum.sourceMtime) {
          updateAlbumScanMetadataDb(existingAlbum.id, {
            sourceMtime: discoveredAlbum.sourceMtime,
            assetsFingerprint,
            updatedAt: timestamp
          });
        }
        continue;
      }

      if (existingAlbum && !shouldReplaceAlbum(existingAlbum, discoveredAlbum, assets)) {
        updateAlbumScanMetadataDb(existingAlbum.id, {
          sourceMtime: discoveredAlbum.sourceMtime,
          assetsFingerprint,
          updatedAt: timestamp
        });
        continue;
      }

      const album: AlbumRecord = {
        id: albumId,
        libraryRootId: libraryRoot.id,
        name: discoveredAlbum.name,
        sourceType: discoveredAlbum.sourceType,
        sourcePath: discoveredAlbum.sourcePath,
        sourceMtime: discoveredAlbum.sourceMtime,
        assetsFingerprint,
        coverAssetId: assets[0]?.id ?? null,
        assetCount: assets.length,
        scanStatus: "ready",
        errorMessage: null,
        createdAt: existingAlbum?.createdAt ?? timestamp,
        updatedAt: timestamp
      };

      replacedBatch.push({
        existingAlbumId: existingAlbum?.id ?? null,
        album,
        assets
      });
      if (replacedBatch.length >= batchSize) {
        flushBatch();
      }

      const now = Date.now();
      if (input?.onProgress && (scannedAlbumsInRoot % 20 === 0 || now - lastProgressAt >= 1000)) {
        input.onProgress({
          libraryRootId: libraryRoot.id,
          albumsDiscovered,
          assetsDiscovered,
          scannedAlbumsInRoot,
          rootIndex: rootIndex + 1,
          totalRoots
        });
        lastProgressAt = now;
      }
    }
    flushBatch();

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

    if (input?.onProgress) {
      input.onProgress({
        libraryRootId: libraryRoot.id,
        albumsDiscovered,
        assetsDiscovered,
        scannedAlbumsInRoot,
        rootIndex: rootIndex + 1,
        totalRoots
      });
    }
  }

  await rebuildSmartAlbums();

  return {
    albumsDiscovered,
    assetsDiscovered
  };
};

export const rescanAlbum = async (albumId: string) => {
  const existingAlbum = findAlbumByIdDb(albumId);
  if (!existingAlbum) {
    throw new ScanAlbumNotFoundError(albumId);
  }

  const libraryRoot = findLibraryRootByIdDb(existingAlbum.libraryRootId);
  if (!libraryRoot) {
    throw new ScanLibraryRootNotFoundError(existingAlbum.libraryRootId);
  }

  const timestamp = nowIso();
  const existingBySourcePath = new Map<string, AlbumRecord>();
  const discoveredAlbum =
    existingAlbum.sourceType === "zip"
      ? await scanZipAlbum(libraryRoot.path, existingAlbum.sourcePath, existingBySourcePath)
      : await scanFolderAlbum(libraryRoot.path, existingAlbum.sourcePath, existingBySourcePath);

  if (!discoveredAlbum) {
    throw new ScanAlbumSourceInvalidError(albumId, existingAlbum.sourcePath);
  }

  const assets = discoveredAlbum.assets.map((asset) => toAssetRecord(existingAlbum.id, timestamp, asset));
  const assetsFingerprint = buildAssetsFingerprint(discoveredAlbum.assets);

  const album: AlbumRecord = {
    id: existingAlbum.id,
    libraryRootId: existingAlbum.libraryRootId,
    name: discoveredAlbum.name,
    sourceType: discoveredAlbum.sourceType,
    sourcePath: discoveredAlbum.sourcePath,
    sourceMtime: discoveredAlbum.sourceMtime,
    assetsFingerprint,
    coverAssetId: assets[0]?.id ?? null,
    assetCount: assets.length,
    scanStatus: "ready",
    errorMessage: null,
    createdAt: existingAlbum.createdAt,
    updatedAt: timestamp
  };

  applyLibraryRootScanDiffDb({
    removedAlbumIds: [],
    replacedAlbums: [
      {
        existingAlbumId: existingAlbum.id,
        album,
        assets
      }
    ]
  });

  await rebuildSmartAlbums();

  return {
    albumId: existingAlbum.id,
    name: album.name,
    assetCount: assets.length
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
