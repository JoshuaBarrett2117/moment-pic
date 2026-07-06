import crypto from "node:crypto";

import type {
  AlbumAssetsDTO,
  AlbumDetailDTO,
  AlbumFavoriteDTO,
  AlbumListItemDTO,
  AlbumShareDTO,
  ManagedAlbumSharesDTO,
  SharedAlbumAuthDTO,
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
  findAlbumShareByTokenDb,
  insertAlbumShareDb,
  isAssetInAlbumDb,
  listActiveAlbumSharesDb,
  listAlbumsDb,
  listAssetsByAlbumIdDb,
  deleteAlbumShareDb,
  deleteExpiredAlbumSharesDb,
  updateAlbumFavoriteDb,
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
    favoriteOnly?: boolean;
  }
) =>
  JSON.stringify({
    page,
    pageSize,
    libraryRootId: input?.libraryRootId ?? "",
    sourceType: input?.sourceType ?? "",
    keyword: input?.keyword?.trim() ?? "",
    favoriteOnly: input?.favoriteOnly ?? false,
    sortBy: input?.sortBy ?? "updatedAt",
    sortOrder: input?.sortOrder ?? "desc"
  });

export const clearAlbumListCache = () => {
  albumListCache.clear();
};

const toAlbumListItem = (row: AlbumRecord): AlbumListItemDTO => ({
  id: row.id,
  name: row.name,
  sourceType: row.sourceType,
  assetCount: row.assetCount,
  coverUrl: row.coverAssetId ? `/api/v1/assets/${row.coverAssetId}/thumbnail` : null,
  isFavorite: Boolean(row.isFavorite),
  updatedAt: row.updatedAt
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
    favoriteOnly?: boolean;
  }
) => {
  const cacheKey = buildAlbumListCacheKey(page, pageSize, input);
  const now = Date.now();
  const cached = albumListCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const result = listAlbumsDb(page, pageSize, input);

  const items: AlbumListItemDTO[] = result.items.map(toAlbumListItem);

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
    isFavorite: Boolean(row.isFavorite),
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
      isFavorite: Boolean(album.isFavorite),
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

export const setAlbumFavorite = async (albumId: string, isFavorite: boolean): Promise<AlbumFavoriteDTO | null> => {
  const album = updateAlbumFavoriteDb(albumId, isFavorite, new Date().toISOString());
  if (!album) {
    return null;
  }
  clearAlbumListCache();
  return {
    albumId: album.id,
    isFavorite: Boolean(album.isFavorite)
  };
};

const hashSharePassword = (password: string): string => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifySharePassword = (password: string, passwordHash: string): boolean => {
  const [salt, expectedHash] = passwordHash.split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

const signShareAccessPayload = (payload: string, passwordHash: string): string =>
  crypto.createHmac("sha256", passwordHash).update(payload).digest("hex");

const createShareAccessToken = (input: { shareId: string; expiresAt: string; passwordHash: string }): string => {
  const payload = Buffer.from(
    JSON.stringify({
      shareId: input.shareId,
      exp: input.expiresAt
    }),
    "utf8"
  ).toString("base64url");
  const signature = signShareAccessPayload(payload, input.passwordHash);
  return `${payload}.${signature}`;
};

const verifyShareAccessToken = (accessToken: string, input: { shareId: string; expiresAt: string; passwordHash: string }): boolean => {
  const [payload, signature] = accessToken.split(".");
  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = signShareAccessPayload(payload, input.passwordHash);
  const actual = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      shareId?: string;
      exp?: string;
    };
    return decoded.shareId === input.shareId && decoded.exp === input.expiresAt && Date.parse(decoded.exp) > Date.now();
  } catch {
    return false;
  }
};

export const createAlbumShare = async (
  albumId: string,
  input: {
    password: string;
    expiresAt: string;
    origin: string;
  }
): Promise<AlbumShareDTO | null> => {
  const album = findAlbumByIdDb(albumId);
  if (!album) {
    return null;
  }

  const password = input.password.trim();
  const expiresAtMs = Date.parse(input.expiresAt);
  if (password.length < 1 || Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new AlbumShareInputInvalidError();
  }

  const token = crypto.randomBytes(18).toString("base64url");
  const expiresAt = new Date(expiresAtMs).toISOString();
  insertAlbumShareDb({
    id: makeId("share"),
    albumId,
    token,
    passwordHash: hashSharePassword(password),
    expiresAt,
    createdAt: new Date().toISOString()
  });

  return {
    token,
    shareUrl: `${input.origin.replace(/\/$/, "")}/share/${token}`,
    expiresAt
  };
};

export const listManagedAlbumShares = async (origin: string): Promise<ManagedAlbumSharesDTO> => {
  const nowIso = new Date().toISOString();
  deleteExpiredAlbumSharesDb(nowIso);
  return {
    items: listActiveAlbumSharesDb(nowIso).map((share) => ({
      id: share.id,
      albumId: share.albumId,
      albumName: share.albumName,
      albumCoverUrl: share.albumCoverAssetId ? `/api/v1/assets/${share.albumCoverAssetId}/thumbnail` : null,
      albumAssetCount: share.albumAssetCount,
      token: share.token,
      shareUrl: `${origin.replace(/\/$/, "")}/share/${share.token}`,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt
    }))
  };
};

export const deleteManagedAlbumShare = async (shareId: string): Promise<boolean> => {
  const nowIso = new Date().toISOString();
  deleteExpiredAlbumSharesDb(nowIso);
  const exists = listActiveAlbumSharesDb(nowIso).some((share) => share.id === shareId);
  if (!exists) {
    return false;
  }
  deleteAlbumShareDb(shareId);
  return true;
};

export class AlbumShareInputInvalidError extends Error {
  constructor() {
    super("album share input invalid");
  }
}

export class AlbumShareNotFoundError extends Error {
  constructor() {
    super("album share not found");
  }
}

export class AlbumSharePasswordInvalidError extends Error {
  constructor() {
    super("album share password invalid");
  }
}

export const authenticateAlbumShare = async (token: string, password: string): Promise<SharedAlbumAuthDTO> => {
  deleteExpiredAlbumSharesDb(new Date().toISOString());

  const share = findAlbumShareByTokenDb(token);
  if (!share) {
    throw new AlbumShareNotFoundError();
  }

  if (!verifySharePassword(password, share.passwordHash)) {
    throw new AlbumSharePasswordInvalidError();
  }

  const album = findAlbumByIdDb(share.albumId);
  if (!album) {
    deleteAlbumShareDb(share.id);
    throw new AlbumShareNotFoundError();
  }

  return {
    token,
    accessToken: createShareAccessToken({
      shareId: share.id,
      expiresAt: share.expiresAt,
      passwordHash: share.passwordHash
    }),
    albumId: album.id,
    name: album.name,
    expiresAt: share.expiresAt
  };
};

export const getSharedAlbumAssets = async (token: string, accessToken: string, page = 1, pageSize = 120): Promise<AlbumAssetsDTO | null> => {
  deleteExpiredAlbumSharesDb(new Date().toISOString());

  const share = findAlbumShareByTokenDb(token);
  if (!share) {
    return null;
  }
  if (!verifyShareAccessToken(accessToken, {
    shareId: share.id,
    expiresAt: share.expiresAt,
    passwordHash: share.passwordHash
  })) {
    return null;
  }

  const assets = await getAlbumAssets(share.albumId, page, pageSize);
  if (!assets) {
    return null;
  }

  return {
    ...assets,
    items: assets.items.map((asset) => ({
      ...asset,
      thumbnailUrl: `/api/v1/shares/${token}/assets/${asset.id}/thumbnail?accessToken=${encodeURIComponent(accessToken)}`,
      originalUrl: `/api/v1/shares/${token}/assets/${asset.id}/original?accessToken=${encodeURIComponent(accessToken)}`
    }))
  };
};

export const canReadSharedAsset = (token: string, assetId: string, accessToken: string): boolean => {
  deleteExpiredAlbumSharesDb(new Date().toISOString());

  const share = findAlbumShareByTokenDb(token);
  if (!share) {
    return false;
  }
  if (!verifyShareAccessToken(accessToken, {
    shareId: share.id,
    expiresAt: share.expiresAt,
    passwordHash: share.passwordHash
  })) {
    return false;
  }

  return isAssetInAlbumDb(share.albumId, assetId);
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
        ...toAlbumListItem(album)
      });
    }
  }

  return items;
};
