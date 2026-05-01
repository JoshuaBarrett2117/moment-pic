import { Pool } from "pg";

import { env } from "../config/env.js";

let pool: Pool | null = null;

const STORAGE_MIGRATIONS_BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS library_roots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL,
    last_scanned_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    library_root_id TEXT NOT NULL REFERENCES library_roots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_path TEXT NOT NULL UNIQUE,
    source_mtime TEXT,
    assets_fingerprint TEXT,
    cover_asset_id TEXT,
    asset_count INTEGER NOT NULL,
    scan_status TEXT NOT NULL,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    extension TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_path TEXT NOT NULL,
    relative_path TEXT,
    zip_entry_path TEXT,
    sort_index INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    size_bytes TEXT,
    source_mtime TEXT,
    thumbnail_key TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (album_id, sort_index)
  );

  CREATE TABLE IF NOT EXISTS thumbnails (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
    cache_key TEXT NOT NULL UNIQUE,
    format TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS system_config (
    id TEXT PRIMARY KEY,
    enable_polling BOOLEAN NOT NULL,
    polling_interval INTEGER NOT NULL,
    preload_before INTEGER NOT NULL,
    preload_after INTEGER NOT NULL,
    default_image_quality_preset TEXT NOT NULL,
    album_list_item_min_width_mobile INTEGER NOT NULL,
    album_list_item_min_width_desktop INTEGER NOT NULL,
    album_detail_item_min_width_mobile INTEGER NOT NULL,
    album_detail_item_min_width_desktop INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS album_views (
    id TEXT PRIMARY KEY,
    album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    viewed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS smart_albums (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_key TEXT NOT NULL UNIQUE,
    cover_asset_id TEXT,
    album_count INTEGER NOT NULL,
    asset_count INTEGER NOT NULL,
    source_summary TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS smart_album_members (
    id TEXT PRIMARY KEY,
    smart_album_id TEXT NOT NULL REFERENCES smart_albums(id) ON DELETE CASCADE,
    album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    source_engine TEXT NOT NULL,
    match_record_id TEXT,
    confidence DOUBLE PRECISION NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_excluded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (smart_album_id, album_id)
  );

  CREATE TABLE IF NOT EXISTS smart_album_match_records (
    id TEXT PRIMARY KEY,
    album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    smart_album_name TEXT NOT NULL,
    normalized_key TEXT NOT NULL,
    source_engine TEXT NOT NULL,
    rule_id TEXT,
    confidence DOUBLE PRECISION NOT NULL,
    matched_scopes_json TEXT NOT NULL,
    matched_tokens_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    run_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS smart_album_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER NOT NULL DEFAULT 100,
    scope TEXT NOT NULL,
    match_mode TEXT NOT NULL,
    patterns_json TEXT NOT NULL,
    normalize_options_json TEXT NOT NULL,
    action TEXT NOT NULL,
    target_name TEXT,
    target_name_template TEXT,
    min_album_count INTEGER NOT NULL DEFAULT 1,
    min_confidence DOUBLE PRECISION NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS smart_album_ai_configs (
    id TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mode TEXT NOT NULL DEFAULT 'assist',
    provider TEXT NOT NULL DEFAULT 'openai',
    api_endpoint TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    api_token TEXT,
    api_model TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
    min_confidence_auto_apply DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    min_cluster_album_count INTEGER NOT NULL DEFAULT 3,
    max_suggestions_per_run INTEGER NOT NULL DEFAULT 50,
    allow_alias_merge BOOLEAN NOT NULL DEFAULT TRUE,
    allow_cross_root_grouping BOOLEAN NOT NULL DEFAULT TRUE,
    excluded_tokens_json TEXT NOT NULL DEFAULT '[]',
    preferred_scopes_json TEXT NOT NULL DEFAULT '["albumName","sourcePath"]',
    review_required_below_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS storage_migrations (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_version TEXT NOT NULL,
    source_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    error_message TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_albums_library_root_id ON albums (library_root_id);
  CREATE INDEX IF NOT EXISTS idx_albums_name ON albums (name);
  CREATE INDEX IF NOT EXISTS idx_albums_source_type ON albums (source_type);
  CREATE INDEX IF NOT EXISTS idx_assets_album_id ON assets (album_id);
  CREATE INDEX IF NOT EXISTS idx_assets_album_sort ON assets (album_id, sort_index);
  CREATE INDEX IF NOT EXISTS idx_assets_thumbnail_key ON assets (thumbnail_key);
  CREATE INDEX IF NOT EXISTS idx_album_views_album_id ON album_views (album_id);
  CREATE INDEX IF NOT EXISTS idx_album_views_viewed_at ON album_views (viewed_at);
  CREATE INDEX IF NOT EXISTS idx_smart_albums_name ON smart_albums (name);
  CREATE INDEX IF NOT EXISTS idx_smart_album_members_album_id ON smart_album_members (album_id);
  CREATE INDEX IF NOT EXISTS idx_smart_album_match_records_album_id ON smart_album_match_records (album_id);
  CREATE INDEX IF NOT EXISTS idx_smart_album_match_records_run_id ON smart_album_match_records (run_id);
  CREATE INDEX IF NOT EXISTS idx_smart_album_rules_enabled_priority ON smart_album_rules (enabled, priority DESC);
  CREATE INDEX IF NOT EXISTS idx_storage_migrations_status_started_at
    ON storage_migrations (status, started_at DESC);
`;

export const getPostgresPool = (): Pool => {
  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
  }

  return pool;
};

export const verifyPostgresConnectivity = async (): Promise<void> => {
  const currentPool = getPostgresPool();
  await currentPool.query("SELECT 1");
};

export const bootstrapPostgresStorage = async (): Promise<void> => {
  const currentPool = getPostgresPool();
  await currentPool.query(STORAGE_MIGRATIONS_BOOTSTRAP_SQL);
};

export const closePostgresPool = async (): Promise<void> => {
  if (!pool) {
    return;
  }

  const currentPool = pool;
  pool = null;
  await currentPool.end();
};
