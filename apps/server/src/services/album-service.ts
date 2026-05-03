import type {
  AlbumAssetsDTO,
  AlbumDetailDTO,
  AlbumListItemDTO,
  AssetDetailDTO,
  LibraryRootDTO
} from "../types/dto.js";
import type { AlbumRecord, LibraryRootRecord } from "../types/store.js";
import {
  type AlbumSortBy,
  type SortOrder,
  countAssetsByAlbumIdDb,
  deleteAlbumDb,
  deleteAssetDb,
  findAlbumByIdDb,
  findAssetByIdDb,
  listAlbumsDb,
  listAssetsByAlbumIdDb,
} from "../repositories/album-repository.js";
import { listLibraryRootsDb, deleteLibraryRootDb, upsertLibraryRootDb, updateLibraryRootDb } from "../repositories/library-root-repository.js";
import { makeId } from "../repositories/ids.js";
import { recordAlbumViewDb, getRecentAlbumIdsDb } from "../repositories/system-config-repository.js";

const toAssetUrls = (assetId: string) => ({
  thumbnailUrl: `/api/v1/assets/${assetId}/thumbnail`,
  originalUrl: `/api/v1/assets/${assetId}/original`
});

const ALBUM_LIST_CACHE_TTL_MS = 2000;
type AlbumListResult = {
  items: AlbumListItemDTO[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};
const albumListCache = new Map<string, { expiresAt: number; value: AlbumListResult }>();

const buildAlbumListCacheKey = (
  page: number,
  pageSize: number,
  input?: {
    libraryRootId?: string;
    sourceType?: "folder" | "zip";
    keyword?: string;
    sortBy?: AlbumSortBy;
    sortOrder?: SortOrder;
  }
) =>
  JSON.stringify({
    page,
    pageSize,
    libraryRootId: input?.libraryRootId ?? "",
    sourceType: input?.sourceType ?? "",
    keyword: input?.keyword?.trim() ?? "",
    sortBy: input?.sortBy ?? "updatedAt",
    sortOrder: input?.sortOrder ?? "desc"
  });

export const clearAlbumListCache = () => {
  albumListCache.clear();
};

export const listLibraryRoots = async (): Promise<LibraryRootDTO[]> => {
  return listLibraryRootsDb().map((row: LibraryRootRecord) => ({
    id: row.id,
    name: row.name,
    path: row.path,
    enabled: row.enabled,
    lastScannedAt: row.lastScannedAt
  }));
};

export const listAlbums = async (
  page: number,
  pageSize: number,
  input?: {
    libraryRootId?: string;
    sourceType?: "folder" | "zip";
    keyword?: string;
    sortBy?: AlbumSortBy;
    sortOrder?: SortOrder;
  }
) => {
  const cacheKey = buildAlbumListCacheKey(page, pageSize, input);
  const now = Date.now();
  const cached = albumListCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const result = listAlbumsDb(page, pageSize, input);

  const items: AlbumListItemDTO[] = result.items.map((row: AlbumRecord) => ({
    id: row.id,
    name: row.name,
    sourceType: row.sourceType,
    assetCount: row.assetCount,
    coverUrl: row.coverAssetId ? `/api/v1/assets/${row.coverAssetId}/thumbnail` : null,
    updatedAt: row.updatedAt
  }));

  const payload: AlbumListResult = {
    items,
    pagination: {
      page,
      pageSize,
      total: result.total
    }
  };
  albumListCache.set(cacheKey, {
    expiresAt: now + ALBUM_LIST_CACHE_TTL_MS,
    value: payload
  });
  return payload;
};

export const getAlbumDetail = async (albumId: string): Promise<AlbumDetailDTO | null> => {
  const row = findAlbumByIdDb(albumId);
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    sourceType: row.sourceType,
    assetCount: row.assetCount,
    coverAssetId: row.coverAssetId,
    updatedAt: row.updatedAt
  };
};

export const getAlbumAssets = async (albumId: string, page = 1, pageSize = 120): Promise<AlbumAssetsDTO | null> => {
  const album = findAlbumByIdDb(albumId);
  if (!album) {
    return null;
  }

  const assets = listAssetsByAlbumIdDb(albumId, page, pageSize);
  const total = countAssetsByAlbumIdDb(albumId);

  return {
    album: {
      id: album.id,
      name: album.name,
      assetCount: album.assetCount,
      updatedAt: album.updatedAt
    },
    items: assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      extension: asset.extension,
      width: asset.width,
      height: asset.height,
      sortIndex: asset.sortIndex,
      ...toAssetUrls(asset.id)
    })),
    pagination: {
      page,
      pageSize,
      total
    }
  };
};

export const getAssetDetail = async (assetId: string): Promise<AssetDetailDTO | null> => {
  const asset = findAssetByIdDb(assetId);
  if (!asset) {
    return null;
  }

  return {
    id: asset.id,
    albumId: asset.albumId,
    name: asset.name,
    extension: asset.extension,
    width: asset.width,
    height: asset.height,
    sortIndex: asset.sortIndex,
    ...toAssetUrls(asset.id)
  };
};

export const deleteAlbum = async (albumId: string): Promise<boolean> => {
  const album = findAlbumByIdDb(albumId);
  if (!album) {
    return false;
  }
  deleteAlbumDb(albumId);
  clearAlbumListCache();
  return true;
};

export const deleteAsset = async (assetId: string): Promise<boolean> => {
  const asset = findAssetByIdDb(assetId);
  if (!asset) {
    return false;
  }
  deleteAssetDb(assetId);
  clearAlbumListCache();
  return true;
};

export const deleteLibraryRoot = async (id: string): Promise<boolean> => {
  const root = listLibraryRootsDb().find((r) => r.id === id);
  if (!root) {
    return false;
  }
  deleteLibraryRootDb(id);
  clearAlbumListCache();
  return true;
};

export const addLibraryRoot = async (path: string, name: string): Promise<LibraryRootDTO> => {
  const timestamp = new Date().toISOString();
  const root: LibraryRootRecord = {
    id: makeId("root"),
    name,
    path,
    enabled: true,
    lastScannedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  upsertLibraryRootDb(root);
  clearAlbumListCache();
  return {
    id: root.id,
    name: root.name,
    path: root.path,
    enabled: root.enabled,
    lastScannedAt: root.lastScannedAt
  };
};

export const updateLibraryRoot = async (id: string, updates: { name?: string; path?: string; enabled?: boolean }): Promise<LibraryRootDTO | null> => {
  const updated = updateLibraryRootDb(id, updates);
  if (!updated) {
    return null;
  }
  clearAlbumListCache();
  return {
    id: updated.id,
    name: updated.name,
    path: updated.path,
    enabled: updated.enabled,
    lastScannedAt: updated.lastScannedAt
  };
};

export const recordAlbumView = async (albumId: string): Promise<void> => {
  recordAlbumViewDb(albumId);
};

export const getRecentAlbums = async (limit = 50): Promise<AlbumListItemDTO[]> => {
  const albumIds = getRecentAlbumIdsDb(limit);
  if (albumIds.length === 0) {
    return [];
  }

  const items: AlbumListItemDTO[] = [];
  for (const albumId of albumIds) {
    const album = findAlbumByIdDb(albumId);
    if (album) {
      items.push({
        id: album.id,
        name: album.name,
        sourceType: album.sourceType,
        assetCount: album.assetCount,
        coverUrl: album.coverAssetId ? `/api/v1/assets/${album.coverAssetId}/thumbnail` : null,
        updatedAt: album.updatedAt
      });
    }
  }

  return items;
};
