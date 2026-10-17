import { findAlbumByIdDb } from "../repositories/album-repository.js";
import { findAlbumAssetIndexDb, findAlbumProgressDb, listContinueReadingDb, upsertAlbumProgressDb } from "../repositories/album-progress-repository.js";
import type { AlbumProgressDTO, ContinueReadingDTO } from "../types/dto.js";
import { toAlbumListItem } from "./album-service.js";

const requireAlbum = (albumId: string) => {
  const album = findAlbumByIdDb(albumId);
  if (!album) throw Object.assign(new Error("图集不存在"), { statusCode: 404 });
  return album;
};

export const getAlbumProgress = (albumId: string): AlbumProgressDTO | null => {
  requireAlbum(albumId);
  return findAlbumProgressDb(albumId);
};

export const saveAlbumProgress = (albumId: string, input: { assetId: string; assetIndex: number }): AlbumProgressDTO => {
  const album = requireAlbum(albumId);
  const index = findAlbumAssetIndexDb(albumId, input.assetId);
  if (index === null || !Number.isInteger(input.assetIndex) || input.assetIndex !== index || index < 0 || index >= album.assetCount) {
    throw Object.assign(new Error("图片归属或阅读页序无效"), { statusCode: 400 });
  }
  const progress: AlbumProgressDTO = { ...input, total: album.assetCount, updatedAt: new Date().toISOString(), finished: index === album.assetCount - 1 };
  upsertAlbumProgressDb(albumId, progress);
  return progress;
};

export const getContinueReading = (limit = 20): ContinueReadingDTO[] => listContinueReadingDb(limit).map(({ album, progress }) => ({ album: toAlbumListItem(album), progress }));
