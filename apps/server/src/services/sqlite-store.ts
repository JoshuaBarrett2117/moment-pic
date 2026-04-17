import crypto from "node:crypto";

import { getDb } from "../db/sqlite.js";
import type { AlbumRecord, AssetRecord, LibraryRootRecord, ThumbnailRecord, AlbumViewRecord } from "../types/store.js";

export type AlbumSortBy = "name" | "updatedAt" | "assetCount";
export type SortOrder = "asc" | "desc";

const rowToLibraryRoot = (row: Record<string, unknown>): LibraryRootRecord => ({
  id: String(row.id),
  name: String(row.name),
  path: String(row.path),
  enabled: Number(row.enabled) === 1,
  lastScannedAt: row.last_scanned_at ? String(row.last_scanned_at) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToAlbum = (row: Record<string, unknown>): AlbumRecord => ({
  id: String(row.id),
  libraryRootId: String(row.library_root_id),
  name: String(row.name),
  sourceType: row.source_type === "zip" ? "zip" : "folder",
  sourcePath: String(row.source_path),
  sourceMtime: row.source_mtime ? String(row.source_mtime) : null,
  assetsFingerprint: row.assets_fingerprint ? String(row.assets_fingerprint) : null,
  coverAssetId: row.cover_asset_id ? String(row.cover_asset_id) : null,
  assetCount: Number(row.asset_count),
  scanStatus: row.scan_status === "error" ? "error" : "ready",
  errorMessage: row.error_message ? String(row.error_message) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToAsset = (row: Record<string, unknown>): AssetRecord => ({
  id: String(row.id),
  albumId: String(row.album_id),
  name: String(row.name),
  extension: String(row.extension),
  sourceType: row.source_type === "zip" ? "zip" : "folder",
  sourcePath: String(row.source_path),
  relativePath: row.relative_path ? String(row.relative_path) : null,
  zipEntryPath: row.zip_entry_path ? String(row.zip_entry_path) : null,
  sortIndex: Number(row.sort_index),
  width: row.width === null || row.width === undefined ? null : Number(row.width),
  height: row.height === null || row.height === undefined ? null : Number(row.height),
  sizeBytes: row.size_bytes ? String(row.size_bytes) : null,
  sourceMtime: row.source_mtime ? String(row.source_mtime) : null,
  thumbnailKey: row.thumbnail_key ? String(row.thumbnail_key) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToThumbnail = (row: Record<string, unknown>): ThumbnailRecord => ({
  id: String(row.id),
  assetId: String(row.asset_id),
  cacheKey: String(row.cache_key),
  format: String(row.format),
  width: Number(row.width),
  height: Number(row.height),
  filePath: String(row.file_path),
  status: row.status === "stale" ? "stale" : row.status === "error" ? "error" : "ready",
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;

export const listLibraryRootsDb = (): LibraryRootRecord[] => {
  const db = getDb();
  return db.prepare("SELECT * FROM library_roots ORDER BY name ASC").all().map((row: unknown) => rowToLibraryRoot(row as Record<string, unknown>));
};

export const findLibraryRootByPathDb = (targetPath: string): LibraryRootRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM library_roots WHERE path = ? LIMIT 1").get(targetPath) as Record<string, unknown> | undefined;
  return row ? rowToLibraryRoot(row) : null;
};

export const upsertLibraryRootDb = (root: LibraryRootRecord) => {
  const db = getDb();
  db.prepare(`
    INSERT INTO library_roots (id, name, path, enabled, last_scanned_at, created_at, updated_at)
    VALUES (@id, @name, @path, @enabled, @lastScannedAt, @createdAt, @updatedAt)
    ON CONFLICT(path) DO UPDATE SET
      name = excluded.name,
      enabled = excluded.enabled,
      last_scanned_at = excluded.last_scanned_at,
      updated_at = excluded.updated_at
  `).run({
    ...root,
    enabled: root.enabled ? 1 : 0
  });
};

export const deleteLibraryRootDb = (id: string) => {
  const db = getDb();
  const albumIds = db.prepare("SELECT id FROM albums WHERE library_root_id = ?").all(id) as Array<{ id: string }>;
  const deleteThumbnail = db.prepare("DELETE FROM thumbnails WHERE asset_id IN (SELECT id FROM assets WHERE album_id = ?)");
  const deleteAsset = db.prepare("DELETE FROM assets WHERE album_id = ?");
  const deleteAlbum = db.prepare("DELETE FROM albums WHERE id = ?");
  const deleteLibraryRoot = db.prepare("DELETE FROM library_roots WHERE id = ?");
  const transaction = db.transaction(() => {
    for (const album of albumIds) {
      deleteThumbnail.run(album.id);
      deleteAsset.run(album.id);
      deleteAlbum.run(album.id);
    }
    deleteLibraryRoot.run(id);
  });
  transaction();
};

export const updateLibraryRootDb = (id: string, updates: { name?: string; path?: string; enabled?: boolean }) => {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM library_roots WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    return null;
  }
  
  const current = rowToLibraryRoot(existing);
  const updated = {
    ...current,
    name: updates.name ?? current.name,
    path: updates.path ?? current.path,
    enabled: updates.enabled ?? current.enabled,
    updatedAt: new Date().toISOString()
  };
  
  db.prepare(`
    UPDATE library_roots 
    SET name = @name, path = @path, enabled = @enabled, updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id: updated.id,
    name: updated.name,
    path: updated.path,
    enabled: updated.enabled ? 1 : 0,
    updatedAt: updated.updatedAt
  });
  
  return updated;
};

export const clearLibraryDataDb = (libraryRootId: string) => {
  const db = getDb();
  const albumIds = db.prepare("SELECT id FROM albums WHERE library_root_id = ?").all(libraryRootId) as Array<{ id: string }>;
  const deleteThumbnail = db.prepare("DELETE FROM thumbnails WHERE asset_id IN (SELECT id FROM assets WHERE album_id = ?)");
  const deleteAsset = db.prepare("DELETE FROM assets WHERE album_id = ?");
  const deleteAlbum = db.prepare("DELETE FROM albums WHERE id = ?");
  const transaction = db.transaction(() => {
    for (const album of albumIds) {
      deleteThumbnail.run(album.id);
      deleteAsset.run(album.id);
      deleteAlbum.run(album.id);
    }
  });
  transaction();
};

export const insertAlbumWithAssetsDb = (album: AlbumRecord, assets: AssetRecord[]) => {
  const db = getDb();
  const insertAlbum = db.prepare(`
    INSERT INTO albums (id, library_root_id, name, source_type, source_path, source_mtime, assets_fingerprint, cover_asset_id, asset_count, scan_status, error_message, created_at, updated_at)
    VALUES (@id, @libraryRootId, @name, @sourceType, @sourcePath, @sourceMtime, @assetsFingerprint, @coverAssetId, @assetCount, @scanStatus, @errorMessage, @createdAt, @updatedAt)
  `);
  const insertAsset = db.prepare(`
    INSERT INTO assets (id, album_id, name, extension, source_type, source_path, relative_path, zip_entry_path, sort_index, width, height, size_bytes, source_mtime, thumbnail_key, created_at, updated_at)
    VALUES (@id, @albumId, @name, @extension, @sourceType, @sourcePath, @relativePath, @zipEntryPath, @sortIndex, @width, @height, @sizeBytes, @sourceMtime, @thumbnailKey, @createdAt, @updatedAt)
  `);
  const transaction = db.transaction(() => {
    insertAlbum.run(album);
    for (const asset of assets) {
      insertAsset.run(asset);
    }
  });
  transaction();
};

export const applyLibraryRootScanDiffDb = (input: {
  removedAlbumIds: string[];
  replacedAlbums: Array<{
    existingAlbumId: string | null;
    album: AlbumRecord;
    assets: AssetRecord[];
  }>;
}) => {
  const db = getDb();
  const deleteThumbnailByAlbumId = db.prepare("DELETE FROM thumbnails WHERE asset_id IN (SELECT id FROM assets WHERE album_id = ?)");
  const deleteAssetsByAlbumId = db.prepare("DELETE FROM assets WHERE album_id = ?");
  const deleteAlbumById = db.prepare("DELETE FROM albums WHERE id = ?");
  const insertAlbum = db.prepare(`
    INSERT INTO albums (id, library_root_id, name, source_type, source_path, source_mtime, assets_fingerprint, cover_asset_id, asset_count, scan_status, error_message, created_at, updated_at)
    VALUES (@id, @libraryRootId, @name, @sourceType, @sourcePath, @sourceMtime, @assetsFingerprint, @coverAssetId, @assetCount, @scanStatus, @errorMessage, @createdAt, @updatedAt)
  `);
  const insertAsset = db.prepare(`
    INSERT INTO assets (id, album_id, name, extension, source_type, source_path, relative_path, zip_entry_path, sort_index, width, height, size_bytes, source_mtime, thumbnail_key, created_at, updated_at)
    VALUES (@id, @albumId, @name, @extension, @sourceType, @sourcePath, @relativePath, @zipEntryPath, @sortIndex, @width, @height, @sizeBytes, @sourceMtime, @thumbnailKey, @createdAt, @updatedAt)
  `);

  const transaction = db.transaction(() => {
    for (const albumId of input.removedAlbumIds) {
      deleteThumbnailByAlbumId.run(albumId);
      deleteAssetsByAlbumId.run(albumId);
      deleteAlbumById.run(albumId);
    }

    for (const item of input.replacedAlbums) {
      if (item.existingAlbumId) {
        deleteThumbnailByAlbumId.run(item.existingAlbumId);
        deleteAssetsByAlbumId.run(item.existingAlbumId);
        deleteAlbumById.run(item.existingAlbumId);
      }

      insertAlbum.run(item.album);
      for (const asset of item.assets) {
        insertAsset.run(asset);
      }
    }
  });

  transaction();
};

export const listAlbumsDb = (
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
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, unknown> = {
    limit: pageSize,
    offset: (page - 1) * pageSize
  };

  if (input?.libraryRootId) {
    conditions.push("library_root_id = @libraryRootId");
    params.libraryRootId = input.libraryRootId;
  }

  if (input?.sourceType) {
    conditions.push("source_type = @sourceType");
    params.sourceType = input.sourceType;
  }

  if (input?.keyword?.trim()) {
    conditions.push("name LIKE @keyword");
    params.keyword = `%${input.keyword.trim()}%`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderByMap: Record<AlbumSortBy, string> = {
    name: "name",
    updatedAt: "updated_at",
    assetCount: "asset_count"
  };
  const sortBy = input?.sortBy ?? "updatedAt";
  const sortOrder = input?.sortOrder ?? "desc";
  const orderBy = `${orderByMap[sortBy]} ${sortOrder.toUpperCase()}, name ASC`;

  const items = db.prepare(`SELECT * FROM albums ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`).all(params).map((row: unknown) => rowToAlbum(row as Record<string, unknown>));
  const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM albums ${where}`).get(params) as { total: number };
  return { items, total: totalRow.total };
};

export const listAlbumsByLibraryRootIdDb = (libraryRootId: string): AlbumRecord[] => {
  const db = getDb();
  return db
    .prepare("SELECT * FROM albums WHERE library_root_id = ? ORDER BY name ASC")
    .all(libraryRootId)
    .map((row: unknown) => rowToAlbum(row as Record<string, unknown>));
};

export const findAlbumByIdDb = (albumId: string): AlbumRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM albums WHERE id = ? LIMIT 1").get(albumId) as Record<string, unknown> | undefined;
  return row ? rowToAlbum(row) : null;
};

export const listAssetsByAlbumIdDb = (albumId: string, page?: number, pageSize?: number): AssetRecord[] => {
  const db = getDb();
  if (page && pageSize) {
    return db.prepare("SELECT * FROM assets WHERE album_id = ? ORDER BY sort_index ASC LIMIT ? OFFSET ?").all(albumId, pageSize, (page - 1) * pageSize).map((row: unknown) => rowToAsset(row as Record<string, unknown>));
  }

  return db.prepare("SELECT * FROM assets WHERE album_id = ? ORDER BY sort_index ASC").all(albumId).map((row: unknown) => rowToAsset(row as Record<string, unknown>));
};

export const countAssetsByAlbumIdDb = (albumId: string): number => {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS total FROM assets WHERE album_id = ?").get(albumId) as { total: number };
  return row.total;
};

export const listAlbumCoverAssetIdsDb = (libraryRootId?: string, limit = 2000): string[] => {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 10000));

  if (libraryRootId) {
    const rows = db
      .prepare(
        "SELECT cover_asset_id FROM albums WHERE library_root_id = ? AND cover_asset_id IS NOT NULL ORDER BY updated_at DESC, name ASC LIMIT ?"
      )
      .all(libraryRootId, safeLimit) as Array<Record<string, unknown>>;
    return rows.map((row) => String(row.cover_asset_id));
  }

  const rows = db
    .prepare("SELECT cover_asset_id FROM albums WHERE cover_asset_id IS NOT NULL ORDER BY updated_at DESC, name ASC LIMIT ?")
    .all(safeLimit) as Array<Record<string, unknown>>;
  return rows.map((row) => String(row.cover_asset_id));
};

export const findAssetByIdDb = (assetId: string): AssetRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM assets WHERE id = ? LIMIT 1").get(assetId) as Record<string, unknown> | undefined;
  return row ? rowToAsset(row) : null;
};

export const updateAssetMetadataDb = (assetId: string, input: { width: number | null; height: number | null; thumbnailKey: string | null; updatedAt: string }) => {
  const db = getDb();
  db.prepare("UPDATE assets SET width = @width, height = @height, thumbnail_key = @thumbnailKey, updated_at = @updatedAt WHERE id = @assetId").run({ assetId, ...input });
};

export const findThumbnailByAssetIdDb = (assetId: string): ThumbnailRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM thumbnails WHERE asset_id = ? LIMIT 1").get(assetId) as Record<string, unknown> | undefined;
  return row ? rowToThumbnail(row) : null;
};

export const upsertThumbnailDb = (thumbnail: ThumbnailRecord) => {
  const db = getDb();
  db.prepare(`
    INSERT INTO thumbnails (id, asset_id, cache_key, format, width, height, file_path, status, created_at, updated_at)
    VALUES (@id, @assetId, @cacheKey, @format, @width, @height, @filePath, @status, @createdAt, @updatedAt)
    ON CONFLICT(asset_id) DO UPDATE SET
      cache_key = excluded.cache_key,
      format = excluded.format,
      width = excluded.width,
      height = excluded.height,
      file_path = excluded.file_path,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(thumbnail);
};

export const deleteAlbumDb = (albumId: string) => {
  const db = getDb();
  const deleteThumbnail = db.prepare("DELETE FROM thumbnails WHERE asset_id IN (SELECT id FROM assets WHERE album_id = ?)");
  const deleteAsset = db.prepare("DELETE FROM assets WHERE album_id = ?");
  const deleteAlbum = db.prepare("DELETE FROM albums WHERE id = ?");
  const transaction = db.transaction(() => {
    deleteThumbnail.run(albumId);
    deleteAsset.run(albumId);
    deleteAlbum.run(albumId);
  });
  transaction();
};

export const deleteAssetDb = (assetId: string) => {
  const db = getDb();
  const asset = db.prepare("SELECT album_id FROM assets WHERE id = ?").get(assetId) as { album_id: string } | undefined;
  if (!asset) {
    return;
  }
  
  const deleteThumbnail = db.prepare("DELETE FROM thumbnails WHERE asset_id = ?");
  const deleteAsset = db.prepare("DELETE FROM assets WHERE id = ?");
  
  const transaction = db.transaction(() => {
    deleteThumbnail.run(assetId);
    deleteAsset.run(assetId);
    
    const album = db.prepare("SELECT id, cover_asset_id, asset_count FROM albums WHERE id = ?").get(asset.album_id) as { id: string; cover_asset_id: string | null; asset_count: number } | undefined;
    if (album) {
      const remainingAssets = db.prepare("SELECT id FROM assets WHERE album_id = ? ORDER BY sort_index LIMIT 1").get(asset.album_id) as { id: string } | undefined;
      const newCoverAssetId = remainingAssets?.id ?? null;
      const newAssetCount = album.asset_count - 1;
      db.prepare("UPDATE albums SET cover_asset_id = ?, asset_count = ?, updated_at = ? WHERE id = ?")
        .run(newCoverAssetId, newAssetCount, Date.now(), album.id);
    }
  });
  transaction();
};

export const updateAlbumScanMetadataDb = (
  albumId: string,
  input: {
    sourceMtime: string | null;
    assetsFingerprint: string | null;
    updatedAt: string;
  }
) => {
  const db = getDb();
  db.prepare(
    "UPDATE albums SET source_mtime = @sourceMtime, assets_fingerprint = @assetsFingerprint, updated_at = @updatedAt WHERE id = @albumId"
  ).run({
    albumId,
    ...input
  });
};

export type SystemConfigRecord = {
  id: string;
  enablePolling: boolean;
  pollingInterval: number;
  preloadBefore: number;
  preloadAfter: number;
  albumListItemMinWidthMobile: number;
  albumListItemMinWidthDesktop: number;
  albumDetailItemMinWidthMobile: number;
  albumDetailItemMinWidthDesktop: number;
  createdAt: string;
  updatedAt: string;
};

export const getSystemConfigDb = (): SystemConfigRecord => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM system_config WHERE id = 'system_config'").get() as {
    id: string;
    enable_polling: number;
    polling_interval: number;
    preload_before: number;
    preload_after: number;
    album_list_item_min_width_mobile: number;
    album_list_item_min_width_desktop: number;
    album_detail_item_min_width_mobile: number;
    album_detail_item_min_width_desktop: number;
    created_at: string;
    updated_at: string;
  };
  return {
    id: row.id,
    enablePolling: row.enable_polling === 1,
    pollingInterval: row.polling_interval,
    preloadBefore: row.preload_before,
    preloadAfter: row.preload_after,
    albumListItemMinWidthMobile: row.album_list_item_min_width_mobile,
    albumListItemMinWidthDesktop: row.album_list_item_min_width_desktop,
    albumDetailItemMinWidthMobile: row.album_detail_item_min_width_mobile,
    albumDetailItemMinWidthDesktop: row.album_detail_item_min_width_desktop,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export const updateSystemConfigDb = (updates: { enablePolling?: boolean; pollingInterval?: number; preloadBefore?: number; preloadAfter?: number; albumListItemMinWidthMobile?: number; albumListItemMinWidthDesktop?: number; albumDetailItemMinWidthMobile?: number; albumDetailItemMinWidthDesktop?: number }): SystemConfigRecord => {
  const db = getDb();
  const existing = getSystemConfigDb();

  const enablePolling = updates.enablePolling ?? existing.enablePolling;
  const pollingInterval = updates.pollingInterval ?? existing.pollingInterval;
  const preloadBefore = updates.preloadBefore ?? existing.preloadBefore;
  const preloadAfter = updates.preloadAfter ?? existing.preloadAfter;
  const albumListItemMinWidthMobile = updates.albumListItemMinWidthMobile ?? existing.albumListItemMinWidthMobile;
  const albumListItemMinWidthDesktop = updates.albumListItemMinWidthDesktop ?? existing.albumListItemMinWidthDesktop;
  const albumDetailItemMinWidthMobile = updates.albumDetailItemMinWidthMobile ?? existing.albumDetailItemMinWidthMobile;
  const albumDetailItemMinWidthDesktop = updates.albumDetailItemMinWidthDesktop ?? existing.albumDetailItemMinWidthDesktop;

  db.prepare(`
    UPDATE system_config
    SET enable_polling = ?, polling_interval = ?, preload_before = ?, preload_after = ?, album_list_item_min_width_mobile = ?, album_list_item_min_width_desktop = ?, album_detail_item_min_width_mobile = ?, album_detail_item_min_width_desktop = ?, updated_at = datetime('now')
    WHERE id = 'system_config'
  `).run(
    enablePolling ? 1 : 0,
    pollingInterval,
    preloadBefore,
    preloadAfter,
    albumListItemMinWidthMobile,
    albumListItemMinWidthDesktop,
    albumDetailItemMinWidthMobile,
    albumDetailItemMinWidthDesktop
  );

  return getSystemConfigDb();
};

export const recordAlbumViewDb = (albumId: string): void => {
  const db = getDb();
  const id = makeId("view");
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO album_views (id, album_id, viewed_at) VALUES (?, ?, ?)`).run(id, albumId, now);
};

export const listRecentAlbumViewsDb = (limit = 50): AlbumViewRecord[] => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT album_id, MAX(viewed_at) as viewed_at
    FROM album_views
    GROUP BY album_id
    ORDER BY MAX(viewed_at) DESC
    LIMIT ?
  `).all(limit) as { album_id: string; viewed_at: string }[];

  return rows.map((row) => ({
    id: row.album_id,
    albumId: row.album_id,
    viewedAt: row.viewed_at
  }));
};

export const getRecentAlbumIdsDb = (limit = 50): string[] => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT album_id
    FROM album_views
    GROUP BY album_id
    ORDER BY MAX(viewed_at) DESC
    LIMIT ?
  `).all(limit) as { album_id: string }[];

  return rows.map((row) => row.album_id);
};
