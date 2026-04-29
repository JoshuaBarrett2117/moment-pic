import crypto from "node:crypto";
import { getDb } from "../db/sqlite.js";
import type {
  AlbumRecord,
  AlbumViewRecord,
  AssetRecord,
  LibraryRootRecord,
  SmartAlbumAiConfigRecord,
  SmartAlbumMatchRecord,
  SmartAlbumMemberRecord,
  SmartAlbumRecord,
  SmartAlbumRuleRecord,
  ThumbnailRecord
} from "../types/store.js";

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

const rowToSmartAlbum = (row: Record<string, unknown>): SmartAlbumRecord => ({
  id: String(row.id),
  name: String(row.name),
  normalizedKey: String(row.normalized_key),
  coverAssetId: row.cover_asset_id ? String(row.cover_asset_id) : null,
  albumCount: Number(row.album_count),
  assetCount: Number(row.asset_count),
  sourceSummary: row.source_summary ? String(row.source_summary) : null,
  status:
    row.status === "hidden"
      ? "hidden"
      : row.status === "review_pending"
        ? "review_pending"
        : "active",
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToSmartAlbumMember = (row: Record<string, unknown>): SmartAlbumMemberRecord => ({
  id: String(row.id),
  smartAlbumId: String(row.smart_album_id),
  albumId: String(row.album_id),
  sourceEngine: row.source_engine === "ai" ? "ai" : row.source_engine === "manual" ? "manual" : "rule",
  matchRecordId: row.match_record_id ? String(row.match_record_id) : null,
  confidence: Number(row.confidence),
  isPinned: Number(row.is_pinned) === 1,
  isExcluded: Number(row.is_excluded) === 1,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToSmartAlbumMatchRecord = (row: Record<string, unknown>): SmartAlbumMatchRecord => ({
  id: String(row.id),
  albumId: String(row.album_id),
  smartAlbumName: String(row.smart_album_name),
  normalizedKey: String(row.normalized_key),
  sourceEngine: row.source_engine === "ai" ? "ai" : row.source_engine === "manual" ? "manual" : "rule",
  ruleId: row.rule_id ? String(row.rule_id) : null,
  confidence: Number(row.confidence),
  matchedScopesJson: String(row.matched_scopes_json),
  matchedTokensJson: String(row.matched_tokens_json),
  reason: String(row.reason),
  runId: String(row.run_id),
  createdAt: String(row.created_at)
});

const rowToSmartAlbumRule = (row: Record<string, unknown>): SmartAlbumRuleRecord => ({
  id: String(row.id),
  name: String(row.name),
  enabled: Number(row.enabled) === 1,
  priority: Number(row.priority),
  scope:
    row.scope === "sourcePath"
      ? "sourcePath"
      : row.scope === "parentPath"
        ? "parentPath"
        : row.scope === "assetFileName"
          ? "assetFileName"
          : "albumName",
  matchMode:
    row.match_mode === "equals"
      ? "equals"
      : row.match_mode === "prefix"
        ? "prefix"
        : row.match_mode === "suffix"
          ? "suffix"
          : row.match_mode === "regex"
            ? "regex"
            : "contains",
  patternsJson: String(row.patterns_json),
  normalizeOptionsJson: String(row.normalize_options_json),
  action:
    row.action === "mergeAlias"
      ? "mergeAlias"
      : row.action === "exclude"
        ? "exclude"
        : "assignSmartAlbum",
  targetName: row.target_name ? String(row.target_name) : null,
  targetNameTemplate: row.target_name_template ? String(row.target_name_template) : null,
  minAlbumCount: Number(row.min_album_count),
  minConfidence: Number(row.min_confidence),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToSmartAlbumAiConfig = (row: Record<string, unknown>): SmartAlbumAiConfigRecord => ({
  id: String(row.id),
  enabled: Number(row.enabled) === 1,
  mode: row.mode === "auto_low_risk" ? "auto_low_risk" : row.mode === "full_auto" ? "full_auto" : "assist",
  provider: "openai",
  apiEndpoint: row.api_endpoint ? String(row.api_endpoint) : "https://api.openai.com/v1",
  apiToken: row.api_token ? String(row.api_token) : null,
  apiModel: row.api_model ? String(row.api_model) : "gpt-4.1-mini",
  minConfidenceAutoApply: Number(row.min_confidence_auto_apply),
  minClusterAlbumCount: Number(row.min_cluster_album_count),
  maxSuggestionsPerRun: Number(row.max_suggestions_per_run),
  allowAliasMerge: Number(row.allow_alias_merge) === 1,
  allowCrossRootGrouping: Number(row.allow_cross_root_grouping) === 1,
  excludedTokensJson: String(row.excluded_tokens_json),
  preferredScopesJson: String(row.preferred_scopes_json),
  reviewRequiredBelowConfidence: Number(row.review_required_below_confidence),
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

export const findLibraryRootByIdDb = (id: string): LibraryRootRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM library_roots WHERE id = ? LIMIT 1").get(id) as Record<string, unknown> | undefined;
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
  defaultImageQualityPreset: "low" | "balanced" | "high" | "original";
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
    default_image_quality_preset: string;
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
    defaultImageQualityPreset:
      row.default_image_quality_preset === "low" ||
      row.default_image_quality_preset === "high" ||
      row.default_image_quality_preset === "original"
        ? row.default_image_quality_preset
        : "original",
    albumListItemMinWidthMobile: row.album_list_item_min_width_mobile,
    albumListItemMinWidthDesktop: row.album_list_item_min_width_desktop,
    albumDetailItemMinWidthMobile: row.album_detail_item_min_width_mobile,
    albumDetailItemMinWidthDesktop: row.album_detail_item_min_width_desktop,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export const updateSystemConfigDb = (updates: { enablePolling?: boolean; pollingInterval?: number; preloadBefore?: number; preloadAfter?: number; defaultImageQualityPreset?: "low" | "balanced" | "high" | "original"; albumListItemMinWidthMobile?: number; albumListItemMinWidthDesktop?: number; albumDetailItemMinWidthMobile?: number; albumDetailItemMinWidthDesktop?: number }): SystemConfigRecord => {
  const db = getDb();
  const existing = getSystemConfigDb();

  const enablePolling = updates.enablePolling ?? existing.enablePolling;
  const pollingInterval = updates.pollingInterval ?? existing.pollingInterval;
  const preloadBefore = updates.preloadBefore ?? existing.preloadBefore;
  const preloadAfter = updates.preloadAfter ?? existing.preloadAfter;
  const defaultImageQualityPreset = updates.defaultImageQualityPreset ?? existing.defaultImageQualityPreset;
  const albumListItemMinWidthMobile = updates.albumListItemMinWidthMobile ?? existing.albumListItemMinWidthMobile;
  const albumListItemMinWidthDesktop = updates.albumListItemMinWidthDesktop ?? existing.albumListItemMinWidthDesktop;
  const albumDetailItemMinWidthMobile = updates.albumDetailItemMinWidthMobile ?? existing.albumDetailItemMinWidthMobile;
  const albumDetailItemMinWidthDesktop = updates.albumDetailItemMinWidthDesktop ?? existing.albumDetailItemMinWidthDesktop;

  db.prepare(`
    UPDATE system_config
    SET enable_polling = ?, polling_interval = ?, preload_before = ?, preload_after = ?, default_image_quality_preset = ?, album_list_item_min_width_mobile = ?, album_list_item_min_width_desktop = ?, album_detail_item_min_width_mobile = ?, album_detail_item_min_width_desktop = ?, updated_at = datetime('now')
    WHERE id = 'system_config'
  `).run(
    enablePolling ? 1 : 0,
    pollingInterval,
    preloadBefore,
    preloadAfter,
    defaultImageQualityPreset,
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

export const listSmartAlbumsDb = (
  page: number,
  pageSize: number,
  input?: {
    keyword?: string;
    status?: "active" | "hidden" | "review_pending";
    sortBy?: "name" | "updatedAt" | "albumCount" | "assetCount";
    sortOrder?: "asc" | "desc";
  }
) => {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, unknown> = {
    limit: pageSize,
    offset: (page - 1) * pageSize
  };

  if (input?.keyword?.trim()) {
    conditions.push("name LIKE @keyword");
    params.keyword = `%${input.keyword.trim()}%`;
  }

  if (input?.status) {
    conditions.push("status = @status");
    params.status = input.status;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderByMap = {
    name: "name",
    updatedAt: "updated_at",
    albumCount: "album_count",
    assetCount: "asset_count"
  } as const;
  const sortBy = input?.sortBy ?? "updatedAt";
  const sortOrder = input?.sortOrder ?? "desc";
  const orderBy = `${orderByMap[sortBy]} ${sortOrder.toUpperCase()}, name ASC`;

  const items = db
    .prepare(`SELECT * FROM smart_albums ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`)
    .all(params)
    .map((row: unknown) => rowToSmartAlbum(row as Record<string, unknown>));
  const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM smart_albums ${where}`).get(params) as { total: number };
  return { items, total: totalRow.total };
};

export const findSmartAlbumByIdDb = (smartAlbumId: string): SmartAlbumRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM smart_albums WHERE id = ? LIMIT 1").get(smartAlbumId) as Record<string, unknown> | undefined;
  return row ? rowToSmartAlbum(row) : null;
};

export const listSmartAlbumMembersDb = (smartAlbumId: string): SmartAlbumMemberRecord[] => {
  const db = getDb();
  return db
    .prepare("SELECT * FROM smart_album_members WHERE smart_album_id = ? AND is_excluded = 0 ORDER BY confidence DESC, created_at ASC")
    .all(smartAlbumId)
    .map((row: unknown) => rowToSmartAlbumMember(row as Record<string, unknown>));
};

export const listSmartAlbumRulesDb = (): SmartAlbumRuleRecord[] => {
  const db = getDb();
  return db
    .prepare("SELECT * FROM smart_album_rules ORDER BY priority DESC, created_at ASC")
    .all()
    .map((row: unknown) => rowToSmartAlbumRule(row as Record<string, unknown>));
};

export const findSmartAlbumRuleByIdDb = (ruleId: string): SmartAlbumRuleRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM smart_album_rules WHERE id = ? LIMIT 1").get(ruleId) as Record<string, unknown> | undefined;
  return row ? rowToSmartAlbumRule(row) : null;
};

export const upsertSmartAlbumRuleDb = (rule: SmartAlbumRuleRecord): SmartAlbumRuleRecord => {
  const db = getDb();
  db.prepare(`
    INSERT INTO smart_album_rules (
      id, name, enabled, priority, scope, match_mode, patterns_json, normalize_options_json,
      action, target_name, target_name_template, min_album_count, min_confidence, created_at, updated_at
    )
    VALUES (
      @id, @name, @enabled, @priority, @scope, @matchMode, @patternsJson, @normalizeOptionsJson,
      @action, @targetName, @targetNameTemplate, @minAlbumCount, @minConfidence, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      enabled = excluded.enabled,
      priority = excluded.priority,
      scope = excluded.scope,
      match_mode = excluded.match_mode,
      patterns_json = excluded.patterns_json,
      normalize_options_json = excluded.normalize_options_json,
      action = excluded.action,
      target_name = excluded.target_name,
      target_name_template = excluded.target_name_template,
      min_album_count = excluded.min_album_count,
      min_confidence = excluded.min_confidence,
      updated_at = excluded.updated_at
  `).run({
    ...rule,
    enabled: rule.enabled ? 1 : 0
  });

  return rule;
};

export const deleteSmartAlbumRuleDb = (ruleId: string): boolean => {
  const db = getDb();
  const result = db.prepare("DELETE FROM smart_album_rules WHERE id = ?").run(ruleId);
  return result.changes > 0;
};

export const getSmartAlbumAiConfigDb = (): SmartAlbumAiConfigRecord => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM smart_album_ai_configs WHERE id = 'smart_album_ai_config'").get() as Record<string, unknown>;
  return rowToSmartAlbumAiConfig(row);
};

export const updateSmartAlbumAiConfigDb = (
  updates: Omit<SmartAlbumAiConfigRecord, "createdAt" | "updatedAt">
): SmartAlbumAiConfigRecord => {
  const db = getDb();
  const existing = getSmartAlbumAiConfigDb();
  const next: SmartAlbumAiConfigRecord = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    UPDATE smart_album_ai_configs
    SET enabled = @enabled,
        mode = @mode,
        provider = @provider,
        api_endpoint = @apiEndpoint,
        api_token = @apiToken,
        api_model = @apiModel,
        min_confidence_auto_apply = @minConfidenceAutoApply,
        min_cluster_album_count = @minClusterAlbumCount,
        max_suggestions_per_run = @maxSuggestionsPerRun,
        allow_alias_merge = @allowAliasMerge,
        allow_cross_root_grouping = @allowCrossRootGrouping,
        excluded_tokens_json = @excludedTokensJson,
        preferred_scopes_json = @preferredScopesJson,
        review_required_below_confidence = @reviewRequiredBelowConfidence,
        updated_at = @updatedAt
    WHERE id = @id
  `).run({
    ...next,
    enabled: next.enabled ? 1 : 0,
    allowAliasMerge: next.allowAliasMerge ? 1 : 0,
    allowCrossRootGrouping: next.allowCrossRootGrouping ? 1 : 0
  });

  return getSmartAlbumAiConfigDb();
};

export const replaceSmartAlbumsDb = (input: {
  smartAlbums: SmartAlbumRecord[];
  members: SmartAlbumMemberRecord[];
  matchRecords: SmartAlbumMatchRecord[];
}) => {
  const db = getDb();
  const deleteMembers = db.prepare("DELETE FROM smart_album_members");
  const deleteAlbums = db.prepare("DELETE FROM smart_albums");
  const deleteMatchRecords = db.prepare("DELETE FROM smart_album_match_records");
  const insertAlbum = db.prepare(`
    INSERT INTO smart_albums (
      id, name, normalized_key, cover_asset_id, album_count, asset_count, source_summary, status, created_at, updated_at
    )
    VALUES (
      @id, @name, @normalizedKey, @coverAssetId, @albumCount, @assetCount, @sourceSummary, @status, @createdAt, @updatedAt
    )
  `);
  const insertMember = db.prepare(`
    INSERT INTO smart_album_members (
      id, smart_album_id, album_id, source_engine, match_record_id, confidence, is_pinned, is_excluded, created_at, updated_at
    )
    VALUES (
      @id, @smartAlbumId, @albumId, @sourceEngine, @matchRecordId, @confidence, @isPinned, @isExcluded, @createdAt, @updatedAt
    )
  `);
  const insertMatchRecord = db.prepare(`
    INSERT INTO smart_album_match_records (
      id, album_id, smart_album_name, normalized_key, source_engine, rule_id, confidence, matched_scopes_json, matched_tokens_json, reason, run_id, created_at
    )
    VALUES (
      @id, @albumId, @smartAlbumName, @normalizedKey, @sourceEngine, @ruleId, @confidence, @matchedScopesJson, @matchedTokensJson, @reason, @runId, @createdAt
    )
  `);

  const transaction = db.transaction(() => {
    deleteMembers.run();
    deleteAlbums.run();
    deleteMatchRecords.run();
    for (const record of input.matchRecords) {
      insertMatchRecord.run(record);
    }
    for (const smartAlbum of input.smartAlbums) {
      insertAlbum.run(smartAlbum);
    }
    for (const member of input.members) {
      insertMember.run({
        ...member,
        isPinned: member.isPinned ? 1 : 0,
        isExcluded: member.isExcluded ? 1 : 0
      });
    }
  });

  transaction();
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
