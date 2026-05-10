import { getDb } from "../db/sqlite.js";
import type { AlbumRecord, AssetRecord, ThumbnailRecord } from "../types/store.js";
import { rowToAlbum, rowToAsset, rowToThumbnail } from "./sqlite-mappers.js";

export type AlbumSortBy = "name" | "updatedAt" | "assetCount";
export type SortOrder = "asc" | "desc";

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

export const listAlbumsForSmartRuleScopeDb = (): Array<{
  id: string;
  name: string;
  sourcePath: string;
  assetCount: number;
  coverAssetId: string | null;
  updatedAt: string;
  sourceType: "folder" | "zip";
}> => {
  const db = getDb();
  return db
    .prepare("SELECT id, name, source_path, asset_count, cover_asset_id, updated_at, source_type FROM albums ORDER BY updated_at DESC, name ASC")
    .all()
    .map((row: unknown) => {
      const current = row as Record<string, unknown>;
      return {
        id: String(current.id),
        name: String(current.name),
        sourcePath: String(current.source_path),
        assetCount: Number(current.asset_count),
        coverAssetId: current.cover_asset_id ? String(current.cover_asset_id) : null,
        updatedAt: String(current.updated_at),
        sourceType: current.source_type === "zip" ? "zip" : "folder"
      };
    });
};

export const listAssetNamesByAlbumIdDb = (albumId: string): string[] => {
  const db = getDb();
  const rows = db.prepare("SELECT name FROM assets WHERE album_id = ? ORDER BY sort_index ASC").all(albumId) as Array<{ name: string }>;
  return rows.map((row) => row.name);
};
