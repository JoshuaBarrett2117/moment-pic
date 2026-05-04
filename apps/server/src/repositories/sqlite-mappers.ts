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

export const rowToLibraryRoot = (row: Record<string, unknown>): LibraryRootRecord => ({
  id: String(row.id),
  name: String(row.name),
  path: String(row.path),
  enabled: Number(row.enabled) === 1,
  lastScannedAt: row.last_scanned_at ? String(row.last_scanned_at) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

export const rowToAlbum = (row: Record<string, unknown>): AlbumRecord => ({
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

export const rowToAsset = (row: Record<string, unknown>): AssetRecord => ({
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

export const rowToThumbnail = (row: Record<string, unknown>): ThumbnailRecord => ({
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

export const rowToAlbumView = (row: { album_id: string; viewed_at: string }): AlbumViewRecord => ({
  id: row.album_id,
  albumId: row.album_id,
  viewedAt: row.viewed_at
});

export const rowToSmartAlbum = (row: Record<string, unknown>): SmartAlbumRecord => ({
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

export const rowToSmartAlbumMember = (row: Record<string, unknown>): SmartAlbumMemberRecord => ({
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

export const rowToSmartAlbumMatchRecord = (row: Record<string, unknown>): SmartAlbumMatchRecord => ({
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

export const rowToSmartAlbumRule = (row: Record<string, unknown>): SmartAlbumRuleRecord => ({
  id: String(row.id),
  name: String(row.name),
  enabled: Number(row.enabled) === 1,
  sourceEngine: row.source_engine === "ai" ? "ai" : "manual",
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
  generatedNormalizedKey: row.generated_normalized_key ? String(row.generated_normalized_key) : null,
  generatedConfidence: row.generated_confidence === null || row.generated_confidence === undefined ? null : Number(row.generated_confidence),
  generatedReason: row.generated_reason ? String(row.generated_reason) : null,
  generatedRunId: row.generated_run_id ? String(row.generated_run_id) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

export const rowToSmartAlbumAiConfig = (row: Record<string, unknown>): SmartAlbumAiConfigRecord => ({
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
