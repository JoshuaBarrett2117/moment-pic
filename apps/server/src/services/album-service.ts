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
  deleteLibraryRootDb,
  findAlbumByIdDb,
  findAssetByIdDb,
  listAlbumsDb,
  listAssetsByAlbumIdDb,
  listLibraryRootsDb,
  makeId,
  upsertLibraryRootDb
} from "./sqlite-store.js";

const toAssetUrls = (assetId: string) => ({
  thumbnailUrl: `/api/v1/assets/${assetId}/thumbnail`,
  originalUrl: `/api/v1/assets/${assetId}/original`
});

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
  const result = listAlbumsDb(page, pageSize, input);

  const items: AlbumListItemDTO[] = result.items.map((row: AlbumRecord) => ({
    id: row.id,
    name: row.name,
    sourceType: row.sourceType,
    assetCount: row.assetCount,
    coverUrl: row.coverAssetId ? `/api/v1/assets/${row.coverAssetId}/thumbnail` : null,
    updatedAt: row.updatedAt
  }));

  return {
    items,
    pagination: {
      page,
      pageSize,
      total: result.total
    }
  };
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
      assetCount: album.assetCount
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
  return true;
};

export const deleteLibraryRoot = async (id: string): Promise<boolean> => {
  const root = listLibraryRootsDb().find((r) => r.id === id);
  if (!root) {
    return false;
  }
  deleteLibraryRootDb(id);
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
  return {
    id: root.id,
    name: root.name,
    path: root.path,
    enabled: root.enabled,
    lastScannedAt: root.lastScannedAt
  };
};
