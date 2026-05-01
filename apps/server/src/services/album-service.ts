import type {
  AlbumAssetsDTO,
  AlbumDetailDTO,
  AlbumListItemDTO,
  AssetDetailDTO,
  LibraryRootDTO
} from "../types/dto.js";
import type { AlbumRecord, LibraryRootRecord } from "../types/store.js";
import type { AlbumSortBy, SortOrder } from "./sqlite-store.js";
import { getCacheStore, getGalleryRepository } from "./storage-provider.js";

const toAssetUrls = (assetId: string) => ({
  thumbnailUrl: `/api/v1/assets/${assetId}/thumbnail`,
  originalUrl: `/api/v1/assets/${assetId}/original`
});

const ALBUM_LIST_CACHE_TTL_MS = 2000;
const ALBUM_LIST_CACHE_TTL_SECONDS = Math.ceil(ALBUM_LIST_CACHE_TTL_MS / 1000);
const RECENT_ALBUMS_CACHE_TTL_SECONDS = 10;
const ALBUM_LIST_CACHE_PREFIX = "album:list:";
const RECENT_ALBUMS_CACHE_PREFIX = "album:recent:";
type AlbumListResult = {
  items: AlbumListItemDTO[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};
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
  `${ALBUM_LIST_CACHE_PREFIX}${JSON.stringify({
    page,
    pageSize,
    libraryRootId: input?.libraryRootId ?? "",
    sourceType: input?.sourceType ?? "",
    keyword: input?.keyword?.trim() ?? "",
    sortBy: input?.sortBy ?? "updatedAt",
    sortOrder: input?.sortOrder ?? "desc"
  })}`;

const buildRecentAlbumsCacheKey = (limit: number) => `${RECENT_ALBUMS_CACHE_PREFIX}${limit}`;

export const clearAlbumListCache = async () => {
  await getCacheStore().delByPrefix(ALBUM_LIST_CACHE_PREFIX);
};

export const clearRecentAlbumsCache = async () => {
  await getCacheStore().delByPrefix(RECENT_ALBUMS_CACHE_PREFIX);
};

export const listLibraryRoots = async (): Promise<LibraryRootDTO[]> => {
  return (await getGalleryRepository().listLibraryRoots()).map((row: LibraryRootRecord) => ({
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
  const cached = await getCacheStore().get<AlbumListResult>(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await getGalleryRepository().listAlbums(page, pageSize, input);

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
  await getCacheStore().set(cacheKey, payload, ALBUM_LIST_CACHE_TTL_SECONDS);
  return payload;
};

export const getAlbumDetail = async (albumId: string): Promise<AlbumDetailDTO | null> => {
  const row = await getGalleryRepository().findAlbumById(albumId);
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
  const album = await getGalleryRepository().findAlbumById(albumId);
  if (!album) {
    return null;
  }

  const assets = await getGalleryRepository().listAssetsByAlbumId(albumId, page, pageSize);
  const total = await getGalleryRepository().countAssetsByAlbumId(albumId);

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
  const asset = await getGalleryRepository().findAssetById(assetId);
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
  const album = await getGalleryRepository().findAlbumById(albumId);
  if (!album) {
    return false;
  }
  await getGalleryRepository().deleteAlbum(albumId);
  await clearAlbumListCache();
  await clearRecentAlbumsCache();
  return true;
};

export const deleteAsset = async (assetId: string): Promise<boolean> => {
  const asset = await getGalleryRepository().findAssetById(assetId);
  if (!asset) {
    return false;
  }
  await getGalleryRepository().deleteAsset(assetId);
  await clearAlbumListCache();
  await clearRecentAlbumsCache();
  return true;
};

export const deleteLibraryRoot = async (id: string): Promise<boolean> => {
  const root = (await getGalleryRepository().listLibraryRoots()).find((r) => r.id === id);
  if (!root) {
    return false;
  }
  await getGalleryRepository().deleteLibraryRoot(id);
  await clearAlbumListCache();
  await clearRecentAlbumsCache();
  return true;
};

export const addLibraryRoot = async (path: string, name: string): Promise<LibraryRootDTO> => {
  const timestamp = new Date().toISOString();
  const root: LibraryRootRecord = {
    id: getGalleryRepository().makeId("root"),
    name,
    path,
    enabled: true,
    lastScannedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await getGalleryRepository().upsertLibraryRoot(root);
  await clearAlbumListCache();
  await clearRecentAlbumsCache();
  return {
    id: root.id,
    name: root.name,
    path: root.path,
    enabled: root.enabled,
    lastScannedAt: root.lastScannedAt
  };
};

export const updateLibraryRoot = async (id: string, updates: { name?: string; path?: string; enabled?: boolean }): Promise<LibraryRootDTO | null> => {
  const updated = await getGalleryRepository().updateLibraryRoot(id, updates);
  if (!updated) {
    return null;
  }
  await clearAlbumListCache();
  await clearRecentAlbumsCache();
  return {
    id: updated.id,
    name: updated.name,
    path: updated.path,
    enabled: updated.enabled,
    lastScannedAt: updated.lastScannedAt
  };
};

export const recordAlbumView = async (albumId: string): Promise<void> => {
  await getGalleryRepository().recordAlbumView(albumId);
  await clearRecentAlbumsCache();
};

export const getRecentAlbums = async (limit = 50): Promise<AlbumListItemDTO[]> => {
  const cacheKey = buildRecentAlbumsCacheKey(limit);
  const cached = await getCacheStore().get<AlbumListItemDTO[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const albumIds = await getGalleryRepository().getRecentAlbumIds(limit);
  if (albumIds.length === 0) {
    return [];
  }

  const items: AlbumListItemDTO[] = [];
  for (const albumId of albumIds) {
    const album = await getGalleryRepository().findAlbumById(albumId);
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

  await getCacheStore().set(cacheKey, items, RECENT_ALBUMS_CACHE_TTL_SECONDS);
  return items;
};
