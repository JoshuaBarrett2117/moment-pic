import { randomUUID } from "node:crypto";

import type { PoolClient, QueryResultRow } from "pg";

import { getPostgresPool } from "../db/postgres.js";
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
import type { GalleryRepository, AlbumListQuery, SmartAlbumListQuery, SmartRuleScopeAlbum } from "./gallery-repository.js";
import type { AlbumSortBy, SortOrder, SystemConfigRecord } from "./sqlite-store.js";

const unsupported = (methodName: string): never => {
  throw new Error(`postgres gallery repository not implemented yet: ${methodName}`);
};

const makeId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "")}`;

const DEFAULT_SYSTEM_CONFIG_ID = "system_config";

const rowToLibraryRoot = (row: QueryResultRow): LibraryRootRecord => ({
  id: String(row.id),
  name: String(row.name),
  path: String(row.path),
  enabled: Boolean(row.enabled),
  lastScannedAt: row.last_scanned_at ? String(row.last_scanned_at) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToAlbum = (row: QueryResultRow): AlbumRecord => ({
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

const rowToAsset = (row: QueryResultRow): AssetRecord => ({
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

const rowToThumbnail = (row: QueryResultRow): ThumbnailRecord => ({
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

const rowToAlbumView = (row: QueryResultRow): AlbumViewRecord => ({
  id: String(row.id),
  albumId: String(row.album_id),
  viewedAt: String(row.viewed_at)
});

const rowToSmartAlbum = (row: QueryResultRow): SmartAlbumRecord => ({
  id: String(row.id),
  name: String(row.name),
  normalizedKey: String(row.normalized_key),
  coverAssetId: row.cover_asset_id ? String(row.cover_asset_id) : null,
  albumCount: Number(row.album_count),
  assetCount: Number(row.asset_count),
  sourceSummary: row.source_summary ? String(row.source_summary) : null,
  status:
    row.status === "hidden" ? "hidden" : row.status === "review_pending" ? "review_pending" : "active",
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToSmartAlbumMember = (row: QueryResultRow): SmartAlbumMemberRecord => ({
  id: String(row.id),
  smartAlbumId: String(row.smart_album_id),
  albumId: String(row.album_id),
  sourceEngine: row.source_engine === "ai" ? "ai" : row.source_engine === "manual" ? "manual" : "rule",
  matchRecordId: row.match_record_id ? String(row.match_record_id) : null,
  confidence: Number(row.confidence),
  isPinned: Boolean(row.is_pinned),
  isExcluded: Boolean(row.is_excluded),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToSmartAlbumRule = (row: QueryResultRow): SmartAlbumRuleRecord => ({
  id: String(row.id),
  name: String(row.name),
  enabled: Boolean(row.enabled),
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
  action: row.action === "mergeAlias" ? "mergeAlias" : row.action === "exclude" ? "exclude" : "assignSmartAlbum",
  targetName: row.target_name ? String(row.target_name) : null,
  targetNameTemplate: row.target_name_template ? String(row.target_name_template) : null,
  minAlbumCount: Number(row.min_album_count),
  minConfidence: Number(row.min_confidence),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToSmartAlbumAiConfig = (row: QueryResultRow): SmartAlbumAiConfigRecord => ({
  id: String(row.id),
  enabled: Boolean(row.enabled),
  mode: row.mode === "auto_low_risk" ? "auto_low_risk" : row.mode === "full_auto" ? "full_auto" : "assist",
  provider: "openai",
  apiEndpoint: row.api_endpoint ? String(row.api_endpoint) : "https://api.openai.com/v1",
  apiToken: row.api_token ? String(row.api_token) : null,
  apiModel: row.api_model ? String(row.api_model) : "gpt-4.1-mini",
  minConfidenceAutoApply: Number(row.min_confidence_auto_apply),
  minClusterAlbumCount: Number(row.min_cluster_album_count),
  maxSuggestionsPerRun: Number(row.max_suggestions_per_run),
  allowAliasMerge: Boolean(row.allow_alias_merge),
  allowCrossRootGrouping: Boolean(row.allow_cross_root_grouping),
  excludedTokensJson: String(row.excluded_tokens_json),
  preferredScopesJson: String(row.preferred_scopes_json),
  reviewRequiredBelowConfidence: Number(row.review_required_below_confidence),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const rowToSystemConfig = (row: QueryResultRow): SystemConfigRecord => ({
  id: String(row.id),
  enablePolling: Boolean(row.enable_polling),
  pollingInterval: Number(row.polling_interval),
  preloadBefore: Number(row.preload_before),
  preloadAfter: Number(row.preload_after),
  defaultImageQualityPreset:
    row.default_image_quality_preset === "low" ||
    row.default_image_quality_preset === "high" ||
    row.default_image_quality_preset === "original"
      ? row.default_image_quality_preset
      : "original",
  albumListItemMinWidthMobile: Number(row.album_list_item_min_width_mobile),
  albumListItemMinWidthDesktop: Number(row.album_list_item_min_width_desktop),
  albumDetailItemMinWidthMobile: Number(row.album_detail_item_min_width_mobile),
  albumDetailItemMinWidthDesktop: Number(row.album_detail_item_min_width_desktop),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const ensureSystemConfig = async (): Promise<SystemConfigRecord> => {
  const now = new Date().toISOString();
  await getPostgresPool().query(
    `INSERT INTO system_config (
      id,
      enable_polling,
      polling_interval,
      preload_before,
      preload_after,
      default_image_quality_preset,
      album_list_item_min_width_mobile,
      album_list_item_min_width_desktop,
      album_detail_item_min_width_mobile,
      album_detail_item_min_width_desktop,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_SYSTEM_CONFIG_ID, true, 60000, 2, 3, "original", 160, 300, 160, 300, now, now]
  );

  const result = await getPostgresPool().query("SELECT * FROM system_config WHERE id = $1 LIMIT 1", [
    DEFAULT_SYSTEM_CONFIG_ID
  ]);
  return rowToSystemConfig(result.rows[0]);
};

const buildAlbumWhere = (input?: AlbumListQuery) => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (input?.libraryRootId) {
    params.push(input.libraryRootId);
    conditions.push(`library_root_id = $${params.length}`);
  }

  if (input?.sourceType) {
    params.push(input.sourceType);
    conditions.push(`source_type = $${params.length}`);
  }

  if (input?.keyword?.trim()) {
    params.push(`%${input.keyword.trim()}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params
  };
};

const buildAlbumOrderBy = (sortBy: AlbumSortBy = "updatedAt", sortOrder: SortOrder = "desc") => {
  const orderByMap: Record<AlbumSortBy, string> = {
    name: "name",
    updatedAt: "updated_at",
    assetCount: "asset_count"
  };
  return `${orderByMap[sortBy]} ${sortOrder.toUpperCase()}, name ASC`;
};

const buildSmartAlbumWhere = (input?: SmartAlbumListQuery) => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (input?.keyword?.trim()) {
    params.push(`%${input.keyword.trim()}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }

  if (input?.status) {
    params.push(input.status);
    conditions.push(`status = $${params.length}`);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params
  };
};

const buildSmartAlbumOrderBy = (sortBy: SmartAlbumListQuery["sortBy"] = "updatedAt", sortOrder: SmartAlbumListQuery["sortOrder"] = "desc") => {
  const orderByMap = {
    name: "name",
    updatedAt: "updated_at",
    albumCount: "album_count",
    assetCount: "asset_count"
  } as const;
  return `${orderByMap[sortBy ?? "updatedAt"]} ${(sortOrder ?? "desc").toUpperCase()}, name ASC`;
};

const insertAlbumWithAssetsUsingClient = async (client: PoolClient, album: AlbumRecord, assets: AssetRecord[]) => {
  await client.query(
    `INSERT INTO albums (id, library_root_id, name, source_type, source_path, source_mtime, assets_fingerprint, cover_asset_id, asset_count, scan_status, error_message, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      album.id,
      album.libraryRootId,
      album.name,
      album.sourceType,
      album.sourcePath,
      album.sourceMtime,
      album.assetsFingerprint,
      album.coverAssetId,
      album.assetCount,
      album.scanStatus,
      album.errorMessage,
      album.createdAt,
      album.updatedAt
    ]
  );
  for (const asset of assets) {
    await client.query(
      `INSERT INTO assets (id, album_id, name, extension, source_type, source_path, relative_path, zip_entry_path, sort_index, width, height, size_bytes, source_mtime, thumbnail_key, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        asset.id,
        asset.albumId,
        asset.name,
        asset.extension,
        asset.sourceType,
        asset.sourcePath,
        asset.relativePath,
        asset.zipEntryPath,
        asset.sortIndex,
        asset.width,
        asset.height,
        asset.sizeBytes,
        asset.sourceMtime,
        asset.thumbnailKey,
        asset.createdAt,
        asset.updatedAt
      ]
    );
  }
};

const ensureSmartAlbumAiConfig = async (): Promise<SmartAlbumAiConfigRecord> => {
  const now = new Date().toISOString();
  await getPostgresPool().query(
    `INSERT INTO smart_album_ai_configs (
      id, enabled, mode, provider, api_endpoint, api_token, api_model,
      min_confidence_auto_apply, min_cluster_album_count, max_suggestions_per_run,
      allow_alias_merge, allow_cross_root_grouping, excluded_tokens_json,
      preferred_scopes_json, review_required_below_confidence, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (id) DO NOTHING`,
    [
      "smart_album_ai_config",
      false,
      "assist",
      "openai",
      "https://api.openai.com/v1",
      null,
      "gpt-4.1-mini",
      0.9,
      3,
      50,
      true,
      true,
      "[]",
      "[\"albumName\",\"sourcePath\"]",
      0.9,
      now,
      now
    ]
  );

  const result = await getPostgresPool().query(
    "SELECT * FROM smart_album_ai_configs WHERE id = $1 LIMIT 1",
    ["smart_album_ai_config"]
  );
  return rowToSmartAlbumAiConfig(result.rows[0]);
};

export const postgresGalleryRepository: GalleryRepository = {
  makeId,
  listLibraryRoots: async () => {
    const result = await getPostgresPool().query("SELECT * FROM library_roots ORDER BY name ASC");
    return result.rows.map(rowToLibraryRoot);
  },
  findLibraryRootByPath: async (targetPath) => {
    const result = await getPostgresPool().query("SELECT * FROM library_roots WHERE path = $1 LIMIT 1", [targetPath]);
    return result.rows[0] ? rowToLibraryRoot(result.rows[0]) : null;
  },
  findLibraryRootById: async (id) => {
    const result = await getPostgresPool().query("SELECT * FROM library_roots WHERE id = $1 LIMIT 1", [id]);
    return result.rows[0] ? rowToLibraryRoot(result.rows[0]) : null;
  },
  upsertLibraryRoot: async (root) => {
    await getPostgresPool().query(
      `INSERT INTO library_roots (id, name, path, enabled, last_scanned_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (path) DO UPDATE SET
         name = EXCLUDED.name,
         enabled = EXCLUDED.enabled,
         last_scanned_at = EXCLUDED.last_scanned_at,
         updated_at = EXCLUDED.updated_at`,
      [root.id, root.name, root.path, root.enabled, root.lastScannedAt, root.createdAt, root.updatedAt]
    );
  },
  deleteLibraryRoot: async (id) => {
    await getPostgresPool().query("DELETE FROM library_roots WHERE id = $1", [id]);
  },
  updateLibraryRoot: async (id, updates) => {
    const existing = await postgresGalleryRepository.findLibraryRootById(id);
    if (!existing) {
      return null;
    }

    const updated: LibraryRootRecord = {
      ...existing,
      name: updates.name ?? existing.name,
      path: updates.path ?? existing.path,
      enabled: updates.enabled ?? existing.enabled,
      updatedAt: new Date().toISOString()
    };

    await getPostgresPool().query(
      "UPDATE library_roots SET name = $2, path = $3, enabled = $4, updated_at = $5 WHERE id = $1",
      [id, updated.name, updated.path, updated.enabled, updated.updatedAt]
    );
    return updated;
  },
  clearLibraryData: async (libraryRootId) => {
    await getPostgresPool().query("DELETE FROM albums WHERE library_root_id = $1", [libraryRootId]);
  },
  insertAlbumWithAssets: async (album, assets) =>
    withTransaction(async (client) => insertAlbumWithAssetsUsingClient(client, album, assets)),
  applyLibraryRootScanDiff: async (input) =>
    withTransaction(async (client) => {
      for (const albumId of input.removedAlbumIds) {
        await client.query("DELETE FROM albums WHERE id = $1", [albumId]);
      }

      for (const item of input.replacedAlbums) {
        if (item.existingAlbumId) {
          await client.query("DELETE FROM albums WHERE id = $1", [item.existingAlbumId]);
        }
        await insertAlbumWithAssetsUsingClient(client, item.album, item.assets);
      }
    }),
  listAlbums: async (page, pageSize, input) => {
    const { where, params } = buildAlbumWhere(input);
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);
    const offset = (safePage - 1) * safePageSize;
    const orderBy = buildAlbumOrderBy(input?.sortBy, input?.sortOrder);

    const itemsResult = await getPostgresPool().query(
      `SELECT * FROM albums ${where} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, safePageSize, offset]
    );
    const totalResult = await getPostgresPool().query(
      `SELECT COUNT(*)::int AS total FROM albums ${where}`,
      params
    );

    return {
      items: itemsResult.rows.map(rowToAlbum),
      total: Number(totalResult.rows[0]?.total ?? 0)
    };
  },
  listAlbumsByLibraryRootId: async (libraryRootId) => {
    const result = await getPostgresPool().query(
      "SELECT * FROM albums WHERE library_root_id = $1 ORDER BY name ASC",
      [libraryRootId]
    );
    return result.rows.map(rowToAlbum);
  },
  findAlbumById: async (albumId) => {
    const result = await getPostgresPool().query("SELECT * FROM albums WHERE id = $1 LIMIT 1", [albumId]);
    return result.rows[0] ? rowToAlbum(result.rows[0]) : null;
  },
  listAssetsByAlbumId: async (albumId, page, pageSize) => {
    if (page && pageSize) {
      const result = await getPostgresPool().query(
        "SELECT * FROM assets WHERE album_id = $1 ORDER BY sort_index ASC LIMIT $2 OFFSET $3",
        [albumId, pageSize, (page - 1) * pageSize]
      );
      return result.rows.map(rowToAsset);
    }

    const result = await getPostgresPool().query(
      "SELECT * FROM assets WHERE album_id = $1 ORDER BY sort_index ASC",
      [albumId]
    );
    return result.rows.map(rowToAsset);
  },
  countAssetsByAlbumId: async (albumId) => {
    const result = await getPostgresPool().query(
      "SELECT COUNT(*)::int AS total FROM assets WHERE album_id = $1",
      [albumId]
    );
    return Number(result.rows[0]?.total ?? 0);
  },
  listAlbumCoverAssetIds: async (libraryRootId, limit = 2000) => {
    const safeLimit = Math.max(1, Math.min(limit, 10000));
    const result = libraryRootId
      ? await getPostgresPool().query(
          `SELECT cover_asset_id
           FROM albums
           WHERE library_root_id = $1 AND cover_asset_id IS NOT NULL
           ORDER BY updated_at DESC, name ASC
           LIMIT $2`,
          [libraryRootId, safeLimit]
        )
      : await getPostgresPool().query(
          `SELECT cover_asset_id
           FROM albums
           WHERE cover_asset_id IS NOT NULL
           ORDER BY updated_at DESC, name ASC
           LIMIT $1`,
          [safeLimit]
        );
    return result.rows.map((row) => String(row.cover_asset_id));
  },
  findAssetById: async (assetId) => {
    const result = await getPostgresPool().query("SELECT * FROM assets WHERE id = $1 LIMIT 1", [assetId]);
    return result.rows[0] ? rowToAsset(result.rows[0]) : null;
  },
  updateAssetMetadata: async (assetId, input) => {
    await getPostgresPool().query(
      `UPDATE assets
       SET width = $2, height = $3, thumbnail_key = $4, updated_at = $5
       WHERE id = $1`,
      [assetId, input.width, input.height, input.thumbnailKey, input.updatedAt]
    );
  },
  findThumbnailByAssetId: async (assetId) => {
    const result = await getPostgresPool().query("SELECT * FROM thumbnails WHERE asset_id = $1 LIMIT 1", [assetId]);
    return result.rows[0] ? rowToThumbnail(result.rows[0]) : null;
  },
  upsertThumbnail: async (thumbnail) => {
    await getPostgresPool().query(
      `INSERT INTO thumbnails (id, asset_id, cache_key, format, width, height, file_path, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (asset_id) DO UPDATE SET
         cache_key = EXCLUDED.cache_key,
         format = EXCLUDED.format,
         width = EXCLUDED.width,
         height = EXCLUDED.height,
         file_path = EXCLUDED.file_path,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        thumbnail.id,
        thumbnail.assetId,
        thumbnail.cacheKey,
        thumbnail.format,
        thumbnail.width,
        thumbnail.height,
        thumbnail.filePath,
        thumbnail.status,
        thumbnail.createdAt,
        thumbnail.updatedAt
      ]
    );
  },
  deleteAlbum: async (albumId) => {
    await getPostgresPool().query("DELETE FROM albums WHERE id = $1", [albumId]);
  },
  deleteAsset: async (assetId) =>
    withTransaction(async (client) => {
      const assetResult = await client.query("SELECT album_id FROM assets WHERE id = $1 LIMIT 1", [assetId]);
      const albumId = assetResult.rows[0]?.album_id ? String(assetResult.rows[0].album_id) : null;
      if (!albumId) {
        return;
      }

      await client.query("DELETE FROM assets WHERE id = $1", [assetId]);

      const albumResult = await client.query(
        "SELECT id, cover_asset_id, asset_count FROM albums WHERE id = $1 LIMIT 1",
        [albumId]
      );
      if (!albumResult.rows[0]) {
        return;
      }

      const remainingAssetResult = await client.query(
        "SELECT id FROM assets WHERE album_id = $1 ORDER BY sort_index ASC LIMIT 1",
        [albumId]
      );
      const nextCoverAssetId = remainingAssetResult.rows[0]?.id ? String(remainingAssetResult.rows[0].id) : null;
      const nextAssetCount = Math.max(0, Number(albumResult.rows[0].asset_count) - 1);
      await client.query(
        "UPDATE albums SET cover_asset_id = $2, asset_count = $3, updated_at = $4 WHERE id = $1",
        [albumId, nextCoverAssetId, nextAssetCount, new Date().toISOString()]
      );
    }),
  updateAlbumScanMetadata: async (albumId, input) => {
    await getPostgresPool().query(
      `UPDATE albums
       SET source_mtime = $2, assets_fingerprint = $3, updated_at = $4
       WHERE id = $1`,
      [albumId, input.sourceMtime, input.assetsFingerprint, input.updatedAt]
    );
  },
  getSystemConfig: async () => ensureSystemConfig(),
  updateSystemConfig: async (updates) => {
    const existing = await ensureSystemConfig();
    const next: SystemConfigRecord = {
      ...existing,
      enablePolling: updates.enablePolling ?? existing.enablePolling,
      pollingInterval: updates.pollingInterval ?? existing.pollingInterval,
      preloadBefore: updates.preloadBefore ?? existing.preloadBefore,
      preloadAfter: updates.preloadAfter ?? existing.preloadAfter,
      defaultImageQualityPreset: updates.defaultImageQualityPreset ?? existing.defaultImageQualityPreset,
      albumListItemMinWidthMobile: updates.albumListItemMinWidthMobile ?? existing.albumListItemMinWidthMobile,
      albumListItemMinWidthDesktop: updates.albumListItemMinWidthDesktop ?? existing.albumListItemMinWidthDesktop,
      albumDetailItemMinWidthMobile: updates.albumDetailItemMinWidthMobile ?? existing.albumDetailItemMinWidthMobile,
      albumDetailItemMinWidthDesktop: updates.albumDetailItemMinWidthDesktop ?? existing.albumDetailItemMinWidthDesktop,
      updatedAt: new Date().toISOString()
    };

    await getPostgresPool().query(
      `UPDATE system_config
       SET enable_polling = $2,
           polling_interval = $3,
           preload_before = $4,
           preload_after = $5,
           default_image_quality_preset = $6,
           album_list_item_min_width_mobile = $7,
           album_list_item_min_width_desktop = $8,
           album_detail_item_min_width_mobile = $9,
           album_detail_item_min_width_desktop = $10,
           updated_at = $11
       WHERE id = $1`,
      [
        next.id,
        next.enablePolling,
        next.pollingInterval,
        next.preloadBefore,
        next.preloadAfter,
        next.defaultImageQualityPreset,
        next.albumListItemMinWidthMobile,
        next.albumListItemMinWidthDesktop,
        next.albumDetailItemMinWidthMobile,
        next.albumDetailItemMinWidthDesktop,
        next.updatedAt
      ]
    );
    return ensureSystemConfig();
  },
  recordAlbumView: async (albumId) => {
    await getPostgresPool().query(
      "INSERT INTO album_views (id, album_id, viewed_at) VALUES ($1, $2, $3)",
      [makeId("view"), albumId, new Date().toISOString()]
    );
  },
  listRecentAlbumViews: async (limit = 50) => {
    const result = await getPostgresPool().query(
      `SELECT DISTINCT ON (album_id) album_id, album_id AS id, viewed_at
       FROM album_views
       ORDER BY album_id, viewed_at DESC`
    );
    return result.rows
      .map(rowToAlbumView)
      .sort((left, right) => right.viewedAt.localeCompare(left.viewedAt))
      .slice(0, limit);
  },
  getRecentAlbumIds: async (limit = 50) => {
    const result = await getPostgresPool().query(
      `SELECT album_id
       FROM album_views
       GROUP BY album_id
       ORDER BY MAX(viewed_at) DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map((row) => String(row.album_id));
  },
  listSmartAlbums: async (page, pageSize, input) => {
    const { where, params } = buildSmartAlbumWhere(input);
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);
    const offset = (safePage - 1) * safePageSize;
    const orderBy = buildSmartAlbumOrderBy(input?.sortBy, input?.sortOrder);

    const itemsResult = await getPostgresPool().query(
      `SELECT * FROM smart_albums ${where} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, safePageSize, offset]
    );
    const totalResult = await getPostgresPool().query(
      `SELECT COUNT(*)::int AS total FROM smart_albums ${where}`,
      params
    );
    return {
      items: itemsResult.rows.map(rowToSmartAlbum),
      total: Number(totalResult.rows[0]?.total ?? 0)
    };
  },
  findSmartAlbumById: async (smartAlbumId) => {
    const result = await getPostgresPool().query("SELECT * FROM smart_albums WHERE id = $1 LIMIT 1", [smartAlbumId]);
    return result.rows[0] ? rowToSmartAlbum(result.rows[0]) : null;
  },
  listSmartAlbumMembers: async (smartAlbumId) => {
    const result = await getPostgresPool().query(
      `SELECT * FROM smart_album_members
       WHERE smart_album_id = $1 AND is_excluded = FALSE
       ORDER BY confidence DESC, created_at ASC`,
      [smartAlbumId]
    );
    return result.rows.map(rowToSmartAlbumMember);
  },
  listSmartAlbumRules: async () => {
    const result = await getPostgresPool().query(
      "SELECT * FROM smart_album_rules ORDER BY priority DESC, created_at ASC"
    );
    return result.rows.map(rowToSmartAlbumRule);
  },
  findSmartAlbumRuleById: async (ruleId) => {
    const result = await getPostgresPool().query(
      "SELECT * FROM smart_album_rules WHERE id = $1 LIMIT 1",
      [ruleId]
    );
    return result.rows[0] ? rowToSmartAlbumRule(result.rows[0]) : null;
  },
  upsertSmartAlbumRule: async (rule) => {
    await getPostgresPool().query(
      `INSERT INTO smart_album_rules (
        id, name, enabled, priority, scope, match_mode, patterns_json, normalize_options_json,
        action, target_name, target_name_template, min_album_count, min_confidence, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        enabled = EXCLUDED.enabled,
        priority = EXCLUDED.priority,
        scope = EXCLUDED.scope,
        match_mode = EXCLUDED.match_mode,
        patterns_json = EXCLUDED.patterns_json,
        normalize_options_json = EXCLUDED.normalize_options_json,
        action = EXCLUDED.action,
        target_name = EXCLUDED.target_name,
        target_name_template = EXCLUDED.target_name_template,
        min_album_count = EXCLUDED.min_album_count,
        min_confidence = EXCLUDED.min_confidence,
        updated_at = EXCLUDED.updated_at`,
      [
        rule.id,
        rule.name,
        rule.enabled,
        rule.priority,
        rule.scope,
        rule.matchMode,
        rule.patternsJson,
        rule.normalizeOptionsJson,
        rule.action,
        rule.targetName,
        rule.targetNameTemplate,
        rule.minAlbumCount,
        rule.minConfidence,
        rule.createdAt,
        rule.updatedAt
      ]
    );
    return rule;
  },
  deleteSmartAlbumRule: async (ruleId) => {
    const result = await getPostgresPool().query("DELETE FROM smart_album_rules WHERE id = $1", [ruleId]);
    return (result.rowCount ?? 0) > 0;
  },
  getSmartAlbumAiConfig: async () => ensureSmartAlbumAiConfig(),
  updateSmartAlbumAiConfig: async (updates) => {
    const existing = await ensureSmartAlbumAiConfig();
    const next: SmartAlbumAiConfigRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await getPostgresPool().query(
      `UPDATE smart_album_ai_configs
       SET enabled = $2,
           mode = $3,
           provider = $4,
           api_endpoint = $5,
           api_token = $6,
           api_model = $7,
           min_confidence_auto_apply = $8,
           min_cluster_album_count = $9,
           max_suggestions_per_run = $10,
           allow_alias_merge = $11,
           allow_cross_root_grouping = $12,
           excluded_tokens_json = $13,
           preferred_scopes_json = $14,
           review_required_below_confidence = $15,
           updated_at = $16
       WHERE id = $1`,
      [
        next.id,
        next.enabled,
        next.mode,
        next.provider,
        next.apiEndpoint,
        next.apiToken,
        next.apiModel,
        next.minConfidenceAutoApply,
        next.minClusterAlbumCount,
        next.maxSuggestionsPerRun,
        next.allowAliasMerge,
        next.allowCrossRootGrouping,
        next.excludedTokensJson,
        next.preferredScopesJson,
        next.reviewRequiredBelowConfidence,
        next.updatedAt
      ]
    );
    return ensureSmartAlbumAiConfig();
  },
  replaceSmartAlbums: async (input) =>
    withTransaction(async (client) => {
      await client.query("DELETE FROM smart_album_members");
      await client.query("DELETE FROM smart_albums");
      await client.query("DELETE FROM smart_album_match_records");

      for (const record of input.matchRecords) {
        const current = record as SmartAlbumMatchRecord;
        await client.query(
          `INSERT INTO smart_album_match_records (
            id, album_id, smart_album_name, normalized_key, source_engine, rule_id, confidence,
            matched_scopes_json, matched_tokens_json, reason, run_id, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            current.id,
            current.albumId,
            current.smartAlbumName,
            current.normalizedKey,
            current.sourceEngine,
            current.ruleId,
            current.confidence,
            current.matchedScopesJson,
            current.matchedTokensJson,
            current.reason,
            current.runId,
            current.createdAt
          ]
        );
      }

      for (const smartAlbum of input.smartAlbums) {
        await client.query(
          `INSERT INTO smart_albums (
            id, name, normalized_key, cover_asset_id, album_count, asset_count, source_summary, status, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            smartAlbum.id,
            smartAlbum.name,
            smartAlbum.normalizedKey,
            smartAlbum.coverAssetId,
            smartAlbum.albumCount,
            smartAlbum.assetCount,
            smartAlbum.sourceSummary,
            smartAlbum.status,
            smartAlbum.createdAt,
            smartAlbum.updatedAt
          ]
        );
      }

      for (const member of input.members) {
        await client.query(
          `INSERT INTO smart_album_members (
            id, smart_album_id, album_id, source_engine, match_record_id, confidence, is_pinned, is_excluded, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            member.id,
            member.smartAlbumId,
            member.albumId,
            member.sourceEngine,
            member.matchRecordId,
            member.confidence,
            member.isPinned,
            member.isExcluded,
            member.createdAt,
            member.updatedAt
          ]
        );
      }
    }),
  listAlbumsForSmartRuleScope: async () => {
    const result = await getPostgresPool().query(
      "SELECT id, name, source_path, asset_count, cover_asset_id, updated_at, source_type FROM albums ORDER BY updated_at DESC, name ASC"
    );
    return result.rows.map((row): SmartRuleScopeAlbum => ({
      id: String(row.id),
      name: String(row.name),
      sourcePath: String(row.source_path),
      assetCount: Number(row.asset_count),
      coverAssetId: row.cover_asset_id ? String(row.cover_asset_id) : null,
      updatedAt: String(row.updated_at),
      sourceType: row.source_type === "zip" ? "zip" : "folder"
    }));
  },
  listAssetNamesByAlbumId: async (albumId) => {
    const result = await getPostgresPool().query(
      "SELECT name FROM assets WHERE album_id = $1 ORDER BY sort_index ASC",
      [albumId]
    );
    return result.rows.map((row) => String(row.name));
  }
};
