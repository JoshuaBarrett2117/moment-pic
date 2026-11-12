import fs from "node:fs";
import path from "node:path";

import { nowIso } from "../lib/time.js";
import type { AlbumRecord, AssetRecord, LibraryRootRecord } from "../types/store.js";
import {
  applyLibraryRootScanDiffDb,
  findAlbumByIdDb,
  listAlbumsDb,
  listAssetsByAlbumIdDb,
  updateAlbumScanMetadataDb,
  updateAlbumScanStatusBatchDb,
  listAlbumsByLibraryRootIdDb
} from "../repositories/album-repository.js";
import { findLibraryRootByIdDb, listLibraryRootsDb, upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import { makeId } from "../repositories/ids.js";
import { runPostLibraryScanTasks } from "./library-scanner/post-scan-tasks.js";
import { iterateAlbumsForRoot, scanFolderAlbum, scanZipAlbum, type ScannedAlbum } from "./library-scanner/album-discovery.js";
import { buildAssetsFingerprint, buildStableAssetId } from "./library-scanner-utils.js";
import { scanCoordinator } from "./scan-coordinator.js";

export { buildStableAssetId } from "./library-scanner-utils.js";

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

export type ScanLibraryInput = {
  libraryRootId?: string;
  batchSize?: number;
  /** 扫描真正开始（拿到协调器执行权）时回调；排队期间不触发。 */
  onStart?: () => void;
  onProgress?: (progress: {
    libraryRootId: string;
    albumsDiscovered: number;
    assetsDiscovered: number;
    scannedAlbumsInRoot: number;
    rootIndex: number;
    totalRoots: number;
  }) => void;
};

const getScanRoots = async (input?: ScanLibraryInput): Promise<LibraryRootRecord[]> => {
  const enabledRoots = listLibraryRootsDb().filter((root) => root.enabled);
  if (!input?.libraryRootId) {
    return enabledRoots;
  }

  return enabledRoots.filter((root) => root.id === input.libraryRootId);
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
  width: asset.width ?? null,
  height: asset.height ?? null,
  sizeBytes: asset.sizeBytes,
  sourceMtime: asset.sourceMtime,
  thumbnailKey: null,
  createdAt: timestamp,
  updatedAt: timestamp
});

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
      current.sourceMtime !== next.sourceMtime ||
      current.width !== next.width || current.height !== next.height
    ) {
      return true;
    }
  }

  return false;
};

/** 内容未变的图集：source_mtime / 指纹有差异才写，且不改 updated_at（“最近更新”只反映真实内容变化）。 */
const syncUnchangedAlbumScanMetadata = (existingAlbum: AlbumRecord, sourceMtime: string, assetsFingerprint: string) => {
  if (existingAlbum.sourceMtime === sourceMtime && existingAlbum.assetsFingerprint === assetsFingerprint) return;
  updateAlbumScanMetadataDb(existingAlbum.id, { sourceMtime, assetsFingerprint });
};

const scanLibraryUnlocked = async (input?: ScanLibraryInput) => {
  input?.onStart?.();
  const libraryRoots = await getScanRoots(input);
  if (input?.libraryRootId && libraryRoots.length === 0) {
    throw new ScanLibraryRootNotFoundError(input.libraryRootId);
  }

  const timestamp = nowIso();
  const batchSize = Math.max(1, Math.min(input?.batchSize ?? 16, 128));
  let albumsDiscovered = 0;
  let assetsDiscovered = 0;
  const totalRoots = libraryRoots.length;
  let failureCount = 0;

  for (let rootIndex = 0; rootIndex < libraryRoots.length; rootIndex += 1) {
    const libraryRoot = libraryRoots[rootIndex];
    const existingAlbums = listAlbumsByLibraryRootIdDb(libraryRoot.id);
    const existingBySourcePath = new Map(existingAlbums.map((album) => [album.sourcePath, album]));
    const discoveredSourcePaths = new Set<string>();
    const failedScopes = new Set<string>();
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

    for await (const discoveredAlbum of iterateAlbumsForRoot(libraryRoot.path, existingBySourcePath, failedScopes)) {
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
        existingAlbum && discoveredAlbum.sourceType === "zip" &&
        existingAlbum.name === discoveredAlbum.name &&
        existingAlbum.sourceType === discoveredAlbum.sourceType &&
        existingAlbum.assetCount === assets.length &&
        existingAlbum.assetsFingerprint === assetsFingerprint
      ) {
        syncUnchangedAlbumScanMetadata(existingAlbum, discoveredAlbum.sourceMtime, assetsFingerprint);
        continue;
      }

      if (existingAlbum && !shouldReplaceAlbum(existingAlbum, discoveredAlbum, assets)) {
        // 内容未变：只同步扫描元数据（且仅在确有差异时写库），不刷新 updated_at。
        syncUnchangedAlbumScanMetadata(existingAlbum, discoveredAlbum.sourceMtime, assetsFingerprint);
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
        isFavorite: existingAlbum?.isFavorite ?? false,
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

    failureCount += failedScopes.size;
    const scopes = [...failedScopes];
    updateAlbumScanStatusBatchDb(existingAlbums.map((existing) => {
      const failed = scopes.some((scope) => existing.sourcePath === scope || existing.sourcePath.startsWith(scope + path.sep));
      return { albumId: existing.id, status: failed ? "error" : "ready", message: failed ? "部分扫描失败，已跳过清理，请检查媒体目录后重试" : null };
    }));
    const removedAlbumIds = (failedScopes.size ? [] : existingAlbums)
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

  await runPostLibraryScanTasks();

  return {
    albumsDiscovered,
    assetsDiscovered,
    failureCount,
    outcome: failureCount ? (albumsDiscovered ? "partial" : "failed") : "complete",
    message: failureCount ? "部分扫描失败，已跳过清理，请检查媒体目录后重试" : null
  };
};

const prepareAlbumRescan = async (existingAlbum: AlbumRecord) => {
  const libraryRoot = findLibraryRootByIdDb(existingAlbum.libraryRootId);
  if (!libraryRoot) throw new ScanLibraryRootNotFoundError(existingAlbum.libraryRootId);
  const timestamp = nowIso();
  const existingBySourcePath = new Map([[existingAlbum.sourcePath, existingAlbum]]);
  const discovered = existingAlbum.sourceType === "zip"
    ? await scanZipAlbum(libraryRoot.path, existingAlbum.sourcePath, existingBySourcePath)
    : await scanFolderAlbum(libraryRoot.path, existingAlbum.sourcePath, existingBySourcePath);
  if (!discovered) return null;
  if (discovered.reuseExisting) return { album: existingAlbum, assets: [], reused: true };
  const assets = discovered.assets.map((asset) => toAssetRecord(existingAlbum.id, timestamp, asset));
  if (!shouldReplaceAlbum(existingAlbum, discovered, assets)) {
    syncUnchangedAlbumScanMetadata(existingAlbum, discovered.sourceMtime, buildAssetsFingerprint(discovered.assets));
    return { album: existingAlbum, assets: [], reused: true };
  }
  return {
    album: { ...existingAlbum, name: discovered.name, sourceMtime: discovered.sourceMtime,
      assetsFingerprint: buildAssetsFingerprint(discovered.assets),
      coverAssetId: assets.some((asset) => asset.id === existingAlbum.coverAssetId) ? existingAlbum.coverAssetId : assets[0]?.id ?? null,
      assetCount: assets.length, scanStatus: "ready", errorMessage: null, updatedAt: timestamp } satisfies AlbumRecord,
    assets, reused: false
  };
};

const rescanAlbumUnlocked = async (albumId: string) => {
  const existing = findAlbumByIdDb(albumId);
  if (!existing) throw new ScanAlbumNotFoundError(albumId);
  const prepared = await prepareAlbumRescan(existing);
  if (!prepared) throw new ScanAlbumSourceInvalidError(albumId, existing.sourcePath);
  if (!prepared.reused) applyLibraryRootScanDiffDb({ removedAlbumIds: [], replacedAlbums: [{ existingAlbumId: albumId, ...prepared }] });
  updateAlbumScanStatusBatchDb([{ albumId, status: "ready", message: null }]);
  await runPostLibraryScanTasks();
  return { albumId, name: prepared.album.name, assetCount: prepared.album.assetCount };
};

// ENOENT 也可能是挂载丢失：只有可读的图库祖先确认子路径消失才允许删除。
const isSourceConfirmedRemoved = async (album: AlbumRecord): Promise<boolean> => {
  const root = findLibraryRootByIdDb(album.libraryRootId);
  if (!root) return false;
  let candidate = album.sourcePath;
  while (candidate !== root.path && candidate.startsWith(root.path + path.sep)) {
    const parent = path.dirname(candidate);
    try { return !(await fs.promises.readdir(parent)).includes(path.basename(candidate)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
      candidate = parent;
    }
  }
  return false;
};

const rescanAlbumsUnlocked = async (albumIds: string[]): Promise<{ rescanned: number; removed: number; failed: number }> => {
  const ids = [...new Set(albumIds)];
  const result = { rescanned: 0, removed: 0, failed: 0 };
  for (let offset = 0; offset < ids.length; offset += 200) {
    const diff: Parameters<typeof applyLibraryRootScanDiffDb>[0] = { removedAlbumIds: [], replacedAlbums: [] };
    const statuses: Parameters<typeof updateAlbumScanStatusBatchDb>[0] = [];
    for (const albumId of ids.slice(offset, offset + 200)) {
      const existing = findAlbumByIdDb(albumId);
      if (!existing) continue;
      try {
        const prepared = await prepareAlbumRescan(existing);
        if (!prepared) { diff.removedAlbumIds.push(albumId); result.removed += 1; }
        else {
          if (!prepared.reused) diff.replacedAlbums.push({ existingAlbumId: albumId, ...prepared });
          statuses.push({ albumId, status: "ready", message: null });
          result.rescanned += 1;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" && await isSourceConfirmedRemoved(existing)) {
          diff.removedAlbumIds.push(albumId); result.removed += 1;
        } else {
          statuses.push({ albumId, status: "error", message: "部分扫描失败，已保留旧索引，请检查媒体目录后重试" });
          result.failed += 1;
        }
      }
    }
    if (diff.removedAlbumIds.length || diff.replacedAlbums.length) applyLibraryRootScanDiffDb(diff);
    updateAlbumScanStatusBatchDb(statuses);
  }
  await runPostLibraryScanTasks();
  return result;
};

// 对外入口一律经扫描协调器串行执行：启动扫描、手动扫描、watcher 增量扫描、单图集重扫互斥。
export const scanLibrary = (input?: ScanLibraryInput) =>
  scanCoordinator.runExclusive(`library:${input?.libraryRootId ?? "*"}`, () => scanLibraryUnlocked(input));

export const rescanAlbum = (albumId: string) =>
  scanCoordinator.runExclusive(`album:${albumId}`, () => rescanAlbumUnlocked(albumId));

export const rescanAlbums = (albumIds: string[]) =>
  scanCoordinator.runExclusive(`albums:${albumIds.length}`, () => rescanAlbumsUnlocked(albumIds));

export const ensureScannedLibrary = async () => {
  const existingRoots = listLibraryRootsDb();
  if (existingRoots.length === 0) {
    return;
  }

  const existing = listAlbumsDb({ page: 1, pageSize: 1 });
  if (existing.total > 0) {
    return;
  }

  await scanLibrary();
};

export const listExistingLibraryRoots = () => listLibraryRootsDb();
