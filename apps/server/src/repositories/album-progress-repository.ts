import { getDb } from "../db/sqlite.js";
import type { AlbumProgressDTO } from "../types/dto.js";
import type { AlbumRecord } from "../types/store.js";
import { rowToAlbum } from "./sqlite-mappers.js";

const toProgress = (row: Record<string, unknown>): AlbumProgressDTO => ({
  assetId: String(row.asset_id), assetIndex: Number(row.asset_index), total: Number(row.total),
  updatedAt: String(row.progress_updated_at ?? row.updated_at), finished: Number(row.asset_index) === Number(row.total) - 1
});

export const findAlbumProgressDb = (albumId: string): AlbumProgressDTO | null => {
  const row = getDb().prepare("SELECT * FROM album_progress WHERE album_id = ?").get(albumId) as Record<string, unknown> | undefined;
  return row ? toProgress(row) : null;
};

export const findAlbumAssetIndexDb = (albumId: string, assetId: string): number | null => {
  const row = getDb().prepare("SELECT sort_index FROM assets WHERE album_id = ? AND id = ?").get(albumId, assetId) as { sort_index: number } | undefined;
  return row ? row.sort_index - 1 : null;
};

export const upsertAlbumProgressDb = (albumId: string, progress: Omit<AlbumProgressDTO, "finished">): void => {
  getDb().prepare(`INSERT INTO album_progress (album_id, asset_id, asset_index, total, updated_at)
    VALUES (@albumId, @assetId, @assetIndex, @total, @updatedAt)
    ON CONFLICT(album_id) DO UPDATE SET asset_id=excluded.asset_id, asset_index=excluded.asset_index,
    total=excluded.total, updated_at=excluded.updated_at`).run({ albumId, ...progress });
};

export const listContinueReadingDb = (limit: number): Array<{ album: AlbumRecord; progress: AlbumProgressDTO }> => {
  const rows = getDb().prepare(`SELECT al.*, p.asset_id, p.asset_index, p.total, p.updated_at AS progress_updated_at
    FROM album_progress p INNER JOIN albums al ON al.id=p.album_id
    WHERE p.total > 0 AND p.asset_index < p.total - 1
    ORDER BY p.updated_at DESC LIMIT ?`).all(Math.max(1, Math.min(100, limit))) as Record<string, unknown>[];
  return rows.map((row) => ({ album: rowToAlbum(row), progress: toProgress(row) }));
};

/** 必须由调用方在替换图集的同步事务内调用，不改变阅读时间。 */
export const reconcileAlbumProgressDb = (albumId: string): void => {
  const db = getDb();
  db.prepare(`UPDATE album_progress
    SET asset_index=(SELECT a.sort_index-1 FROM assets a WHERE a.id=album_progress.asset_id AND a.album_id=album_progress.album_id),
        total=(SELECT al.asset_count FROM albums al WHERE al.id=album_progress.album_id)
    WHERE album_id=@albumId AND EXISTS (SELECT 1 FROM assets a WHERE a.id=album_progress.asset_id AND a.album_id=album_progress.album_id)`).run({ albumId });
  db.prepare(`DELETE FROM album_progress WHERE album_id=@albumId
    AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.id=album_progress.asset_id AND a.album_id=album_progress.album_id)`).run({ albumId });
};
