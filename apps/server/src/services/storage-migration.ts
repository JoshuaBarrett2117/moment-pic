import crypto from "node:crypto";

import type { PoolClient } from "pg";

import { getPostgresPool } from "../db/postgres.js";
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
import type { SystemConfigRecord } from "./sqlite-store.js";

export type StorageSnapshot = {
  libraryRoots: LibraryRootRecord[];
  albums: AlbumRecord[];
  assets: AssetRecord[];
  thumbnails: ThumbnailRecord[];
  systemConfig: SystemConfigRecord | null;
  albumViews: AlbumViewRecord[];
  smartAlbums: SmartAlbumRecord[];
  smartAlbumMembers: SmartAlbumMemberRecord[];
  smartAlbumMatchRecords: SmartAlbumMatchRecord[];
  smartAlbumRules: SmartAlbumRuleRecord[];
  smartAlbumAiConfig: SmartAlbumAiConfigRecord | null;
};

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

const rowToAlbumView = (row: Record<string, unknown>): AlbumViewRecord => ({
  id: String(row.id),
  albumId: String(row.album_id),
  viewedAt: String(row.viewed_at)
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
    row.status === "hidden" ? "hidden" : row.status === "review_pending" ? "review_pending" : "active",
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
  action: row.action === "mergeAlias" ? "mergeAlias" : row.action === "exclude" ? "exclude" : "assignSmartAlbum",
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

const rowToSystemConfig = (row: Record<string, unknown>): SystemConfigRecord => ({
  id: String(row.id),
  enablePolling: Number(row.enable_polling) === 1,
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

const buildSnapshotFingerprint = (snapshot: StorageSnapshot): string =>
  crypto
    .createHash("sha1")
    .update(
      JSON.stringify({
        libraryRoots: snapshot.libraryRoots.length,
        albums: snapshot.albums.length,
        assets: snapshot.assets.length,
        thumbnails: snapshot.thumbnails.length,
        albumViews: snapshot.albumViews.length,
        smartAlbums: snapshot.smartAlbums.length,
        smartAlbumMembers: snapshot.smartAlbumMembers.length,
        smartAlbumMatchRecords: snapshot.smartAlbumMatchRecords.length,
        smartAlbumRules: snapshot.smartAlbumRules.length,
        hasSystemConfig: Boolean(snapshot.systemConfig),
        hasSmartAlbumAiConfig: Boolean(snapshot.smartAlbumAiConfig)
      })
    )
    .digest("hex");

const insertRows = async <T>(
  client: PoolClient,
  rows: T[],
  insertFn: (client: PoolClient, row: T) => Promise<void>
) => {
  for (const row of rows) {
    await insertFn(client, row);
  }
};

const truncateBusinessTables = async (client: PoolClient) => {
  await client.query(`
    TRUNCATE TABLE
      smart_album_members,
      smart_album_match_records,
      smart_album_rules,
      smart_album_ai_configs,
      smart_albums,
      album_views,
      thumbnails,
      assets,
      albums,
      library_roots,
      system_config
    RESTART IDENTITY CASCADE
  `);
};

export const exportSqliteSnapshot = (): StorageSnapshot => {
  const db = getDb();
  const libraryRoots = db.prepare("SELECT * FROM library_roots ORDER BY name ASC").all().map((row: unknown) => rowToLibraryRoot(row as Record<string, unknown>));
  const albums = db.prepare("SELECT * FROM albums ORDER BY updated_at DESC, name ASC").all().map((row: unknown) => rowToAlbum(row as Record<string, unknown>));
  const assets = db.prepare("SELECT * FROM assets ORDER BY album_id ASC, sort_index ASC").all().map((row: unknown) => rowToAsset(row as Record<string, unknown>));
  const thumbnails = db.prepare("SELECT * FROM thumbnails ORDER BY created_at ASC").all().map((row: unknown) => rowToThumbnail(row as Record<string, unknown>));
  const albumViews = db.prepare("SELECT * FROM album_views ORDER BY viewed_at DESC").all().map((row: unknown) => rowToAlbumView(row as Record<string, unknown>));
  const smartAlbums = db.prepare("SELECT * FROM smart_albums ORDER BY updated_at DESC, name ASC").all().map((row: unknown) => rowToSmartAlbum(row as Record<string, unknown>));
  const smartAlbumMembers = db.prepare("SELECT * FROM smart_album_members ORDER BY created_at ASC").all().map((row: unknown) => rowToSmartAlbumMember(row as Record<string, unknown>));
  const smartAlbumMatchRecords = db.prepare("SELECT * FROM smart_album_match_records ORDER BY created_at ASC").all().map((row: unknown) => rowToSmartAlbumMatchRecord(row as Record<string, unknown>));
  const smartAlbumRules = db.prepare("SELECT * FROM smart_album_rules ORDER BY priority DESC, created_at ASC").all().map((row: unknown) => rowToSmartAlbumRule(row as Record<string, unknown>));
  const systemConfigRow = db.prepare("SELECT * FROM system_config WHERE id = 'system_config' LIMIT 1").get() as Record<string, unknown> | undefined;
  const smartAlbumAiConfigRow = db.prepare("SELECT * FROM smart_album_ai_configs WHERE id = 'smart_album_ai_config' LIMIT 1").get() as Record<string, unknown> | undefined;

  return {
    libraryRoots,
    albums,
    assets,
    thumbnails,
    systemConfig: systemConfigRow ? rowToSystemConfig(systemConfigRow) : null,
    albumViews,
    smartAlbums,
    smartAlbumMembers,
    smartAlbumMatchRecords,
    smartAlbumRules,
    smartAlbumAiConfig: smartAlbumAiConfigRow ? rowToSmartAlbumAiConfig(smartAlbumAiConfigRow) : null
  };
};

export const hasCompletedPostgresMigration = async (sourceFingerprint: string): Promise<boolean> => {
  const pool = getPostgresPool();
  const result = await pool.query(
    "SELECT 1 FROM storage_migrations WHERE source_type = $1 AND source_fingerprint = $2 AND status = $3 LIMIT 1",
    ["sqlite", sourceFingerprint, "completed"]
  );
  return (result.rowCount ?? 0) > 0;
};

export const migrateSqliteToPostgres = async (): Promise<{
  fingerprint: string;
  counts: Record<string, number>;
}> => {
  const snapshot = exportSqliteSnapshot();
  const fingerprint = buildSnapshotFingerprint(snapshot);
  if (await hasCompletedPostgresMigration(fingerprint)) {
    return {
      fingerprint,
      counts: {
        libraryRoots: snapshot.libraryRoots.length,
        albums: snapshot.albums.length,
        assets: snapshot.assets.length,
        thumbnails: snapshot.thumbnails.length
      }
    };
  }

  const migrationId = `sqlite_${Date.now()}_${fingerprint.slice(0, 12)}`;
  const pool = getPostgresPool();
  const client = await pool.connect();
  const startedAt = new Date().toISOString();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO storage_migrations (id, source_type, source_version, source_fingerprint, status, started_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [migrationId, "sqlite", "v1", fingerprint, "running", startedAt]
    );

    await truncateBusinessTables(client);

    await insertRows(client, snapshot.libraryRoots, (inner, row) =>
      inner.query(
        `INSERT INTO library_roots (id, name, path, enabled, last_scanned_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.name, row.path, row.enabled, row.lastScannedAt, row.createdAt, row.updatedAt]
      ).then(() => undefined)
    );

    await insertRows(client, snapshot.albums, (inner, row) =>
      inner.query(
        `INSERT INTO albums (id, library_root_id, name, source_type, source_path, source_mtime, assets_fingerprint, cover_asset_id, asset_count, scan_status, error_message, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [row.id, row.libraryRootId, row.name, row.sourceType, row.sourcePath, row.sourceMtime, row.assetsFingerprint, row.coverAssetId, row.assetCount, row.scanStatus, row.errorMessage, row.createdAt, row.updatedAt]
      ).then(() => undefined)
    );

    await insertRows(client, snapshot.assets, (inner, row) =>
      inner.query(
        `INSERT INTO assets (id, album_id, name, extension, source_type, source_path, relative_path, zip_entry_path, sort_index, width, height, size_bytes, source_mtime, thumbnail_key, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [row.id, row.albumId, row.name, row.extension, row.sourceType, row.sourcePath, row.relativePath, row.zipEntryPath, row.sortIndex, row.width, row.height, row.sizeBytes, row.sourceMtime, row.thumbnailKey, row.createdAt, row.updatedAt]
      ).then(() => undefined)
    );

    await insertRows(client, snapshot.thumbnails, (inner, row) =>
      inner.query(
        `INSERT INTO thumbnails (id, asset_id, cache_key, format, width, height, file_path, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [row.id, row.assetId, row.cacheKey, row.format, row.width, row.height, row.filePath, row.status, row.createdAt, row.updatedAt]
      ).then(() => undefined)
    );

    if (snapshot.systemConfig) {
      await client.query(
        `INSERT INTO system_config (id, enable_polling, polling_interval, preload_before, preload_after, default_image_quality_preset, album_list_item_min_width_mobile, album_list_item_min_width_desktop, album_detail_item_min_width_mobile, album_detail_item_min_width_desktop, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          snapshot.systemConfig.id,
          snapshot.systemConfig.enablePolling,
          snapshot.systemConfig.pollingInterval,
          snapshot.systemConfig.preloadBefore,
          snapshot.systemConfig.preloadAfter,
          snapshot.systemConfig.defaultImageQualityPreset,
          snapshot.systemConfig.albumListItemMinWidthMobile,
          snapshot.systemConfig.albumListItemMinWidthDesktop,
          snapshot.systemConfig.albumDetailItemMinWidthMobile,
          snapshot.systemConfig.albumDetailItemMinWidthDesktop,
          snapshot.systemConfig.createdAt,
          snapshot.systemConfig.updatedAt
        ]
      );
    }

    await insertRows(client, snapshot.albumViews, (inner, row) =>
      inner.query(
        `INSERT INTO album_views (id, album_id, viewed_at)
         VALUES ($1, $2, $3)`,
        [row.id, row.albumId, row.viewedAt]
      ).then(() => undefined)
    );

    await insertRows(client, snapshot.smartAlbums, (inner, row) =>
      inner.query(
        `INSERT INTO smart_albums (id, name, normalized_key, cover_asset_id, album_count, asset_count, source_summary, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [row.id, row.name, row.normalizedKey, row.coverAssetId, row.albumCount, row.assetCount, row.sourceSummary, row.status, row.createdAt, row.updatedAt]
      ).then(() => undefined)
    );

    await insertRows(client, snapshot.smartAlbumMembers, (inner, row) =>
      inner.query(
        `INSERT INTO smart_album_members (id, smart_album_id, album_id, source_engine, match_record_id, confidence, is_pinned, is_excluded, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [row.id, row.smartAlbumId, row.albumId, row.sourceEngine, row.matchRecordId, row.confidence, row.isPinned, row.isExcluded, row.createdAt, row.updatedAt]
      ).then(() => undefined)
    );

    await insertRows(client, snapshot.smartAlbumMatchRecords, (inner, row) =>
      inner.query(
        `INSERT INTO smart_album_match_records (id, album_id, smart_album_name, normalized_key, source_engine, rule_id, confidence, matched_scopes_json, matched_tokens_json, reason, run_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [row.id, row.albumId, row.smartAlbumName, row.normalizedKey, row.sourceEngine, row.ruleId, row.confidence, row.matchedScopesJson, row.matchedTokensJson, row.reason, row.runId, row.createdAt]
      ).then(() => undefined)
    );

    await insertRows(client, snapshot.smartAlbumRules, (inner, row) =>
      inner.query(
        `INSERT INTO smart_album_rules (id, name, enabled, priority, scope, match_mode, patterns_json, normalize_options_json, action, target_name, target_name_template, min_album_count, min_confidence, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [row.id, row.name, row.enabled, row.priority, row.scope, row.matchMode, row.patternsJson, row.normalizeOptionsJson, row.action, row.targetName, row.targetNameTemplate, row.minAlbumCount, row.minConfidence, row.createdAt, row.updatedAt]
      ).then(() => undefined)
    );

    if (snapshot.smartAlbumAiConfig) {
      await client.query(
        `INSERT INTO smart_album_ai_configs (id, enabled, mode, provider, api_endpoint, api_token, api_model, min_confidence_auto_apply, min_cluster_album_count, max_suggestions_per_run, allow_alias_merge, allow_cross_root_grouping, excluded_tokens_json, preferred_scopes_json, review_required_below_confidence, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          snapshot.smartAlbumAiConfig.id,
          snapshot.smartAlbumAiConfig.enabled,
          snapshot.smartAlbumAiConfig.mode,
          snapshot.smartAlbumAiConfig.provider,
          snapshot.smartAlbumAiConfig.apiEndpoint,
          snapshot.smartAlbumAiConfig.apiToken,
          snapshot.smartAlbumAiConfig.apiModel,
          snapshot.smartAlbumAiConfig.minConfidenceAutoApply,
          snapshot.smartAlbumAiConfig.minClusterAlbumCount,
          snapshot.smartAlbumAiConfig.maxSuggestionsPerRun,
          snapshot.smartAlbumAiConfig.allowAliasMerge,
          snapshot.smartAlbumAiConfig.allowCrossRootGrouping,
          snapshot.smartAlbumAiConfig.excludedTokensJson,
          snapshot.smartAlbumAiConfig.preferredScopesJson,
          snapshot.smartAlbumAiConfig.reviewRequiredBelowConfidence,
          snapshot.smartAlbumAiConfig.createdAt,
          snapshot.smartAlbumAiConfig.updatedAt
        ]
      );
    }

    await client.query(
      `UPDATE storage_migrations
       SET status = $2, finished_at = $3
       WHERE id = $1`,
      [migrationId, "completed", new Date().toISOString()]
    );
    await client.query("COMMIT");

    return {
      fingerprint,
      counts: {
        libraryRoots: snapshot.libraryRoots.length,
        albums: snapshot.albums.length,
        assets: snapshot.assets.length,
        thumbnails: snapshot.thumbnails.length
      }
    };
  } catch (error) {
    await client.query("ROLLBACK");
    try {
      await client.query(
        `INSERT INTO storage_migrations (id, source_type, source_version, source_fingerprint, status, started_at, finished_at, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           finished_at = EXCLUDED.finished_at,
           error_message = EXCLUDED.error_message`,
        [
          migrationId,
          "sqlite",
          "v1",
          fingerprint,
          "failed",
          startedAt,
          new Date().toISOString(),
          error instanceof Error ? error.message : String(error)
        ]
      );
    } catch {
      // no-op
    }
    throw error;
  } finally {
    client.release();
  }
};
