import type Database from "better-sqlite3";

import { addColumnIfMissing } from "./helpers.js";

/**
 * 基线迁移（user_version 0 → 1）：覆盖引入版本化迁移之前的全部表结构。
 * 对已有数据库是幂等的：CREATE IF NOT EXISTS + 按 PRAGMA table_info 补列。
 */
const BASELINE_SCHEMA = `
    CREATE TABLE IF NOT EXISTS library_roots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL,
      last_scanned_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      library_root_id TEXT NOT NULL,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_path TEXT NOT NULL UNIQUE,
      source_mtime TEXT,
      assets_fingerprint TEXT,
      cover_asset_id TEXT,
      asset_count INTEGER NOT NULL,
      scan_status TEXT NOT NULL,
      error_message TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      album_id TEXT NOT NULL,
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
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS thumbnails (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL UNIQUE,
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
      id TEXT PRIMARY KEY DEFAULT 'system_config',
      enable_polling INTEGER NOT NULL DEFAULT 1,
      polling_interval INTEGER NOT NULL DEFAULT 60000,
      default_image_quality_preset TEXT NOT NULL DEFAULT 'original',
      page_transition_mode TEXT NOT NULL DEFAULT 'page',
      album_list_item_min_width_mobile INTEGER NOT NULL DEFAULT 160,
      album_list_item_min_width_desktop INTEGER NOT NULL DEFAULT 300,
      album_detail_item_min_width_mobile INTEGER NOT NULL DEFAULT 160,
      album_detail_item_min_width_desktop INTEGER NOT NULL DEFAULT 300,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS album_progress (
      album_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      asset_index INTEGER NOT NULL,
      total INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (asset_index >= 0),
      CHECK (total >= 0)
    );

    CREATE TABLE IF NOT EXISTS album_views (
      id TEXT PRIMARY KEY,
      album_id TEXT NOT NULL,
      viewed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS album_shares (
      id TEXT PRIMARY KEY,
      album_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,

      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
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
      smart_album_id TEXT NOT NULL,
      album_id TEXT NOT NULL,
      source_engine TEXT NOT NULL,
      match_record_id TEXT,
      confidence REAL NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_excluded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (smart_album_id, album_id)
    );

    CREATE TABLE IF NOT EXISTS smart_album_match_records (
      id TEXT PRIMARY KEY,
      album_id TEXT NOT NULL,
      smart_album_name TEXT NOT NULL,
      normalized_key TEXT NOT NULL,
      source_engine TEXT NOT NULL,
      rule_id TEXT,
      confidence REAL NOT NULL,
      matched_scopes_json TEXT NOT NULL,
      matched_tokens_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      run_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS smart_album_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      source_engine TEXT NOT NULL DEFAULT 'manual',
      priority INTEGER NOT NULL DEFAULT 100,
      scope TEXT NOT NULL,
      match_mode TEXT NOT NULL,
      patterns_json TEXT NOT NULL,
      normalize_options_json TEXT NOT NULL,
      action TEXT NOT NULL,
      target_name TEXT,
      target_name_template TEXT,
      min_album_count INTEGER NOT NULL DEFAULT 1,
      min_confidence REAL NOT NULL DEFAULT 1,
      generated_normalized_key TEXT,
      generated_confidence REAL,
      generated_reason TEXT,
      generated_run_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS smart_album_ai_configs (
      id TEXT PRIMARY KEY DEFAULT 'smart_album_ai_config',
      enabled INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'assist',
      provider TEXT NOT NULL DEFAULT 'openai',
      api_endpoint TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
      api_token TEXT,
      api_model TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
      min_confidence_auto_apply REAL NOT NULL DEFAULT 0.9,
      min_cluster_album_count INTEGER NOT NULL DEFAULT 3,
      max_suggestions_per_run INTEGER NOT NULL DEFAULT 50,
      allow_alias_merge INTEGER NOT NULL DEFAULT 1,
      allow_cross_root_grouping INTEGER NOT NULL DEFAULT 1,
      excluded_tokens_json TEXT NOT NULL DEFAULT '[]',
      preferred_scopes_json TEXT NOT NULL DEFAULT '[\"albumName\",\"sourcePath\"]',
      review_required_below_confidence REAL NOT NULL DEFAULT 0.9,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_albums_library_root_id ON albums (library_root_id);
    CREATE INDEX IF NOT EXISTS idx_albums_name ON albums (name);
    CREATE INDEX IF NOT EXISTS idx_albums_source_type ON albums (source_type);
    CREATE INDEX IF NOT EXISTS idx_assets_album_id ON assets (album_id);
    CREATE INDEX IF NOT EXISTS idx_assets_album_sort ON assets (album_id, sort_index);
    CREATE INDEX IF NOT EXISTS idx_assets_thumbnail_key ON assets (thumbnail_key);
    CREATE INDEX IF NOT EXISTS idx_album_progress_updated_at ON album_progress (updated_at);
    CREATE INDEX IF NOT EXISTS idx_album_views_album_id ON album_views (album_id);
    CREATE INDEX IF NOT EXISTS idx_album_views_viewed_at ON album_views (viewed_at);
    CREATE INDEX IF NOT EXISTS idx_album_shares_token ON album_shares (token);
    CREATE INDEX IF NOT EXISTS idx_album_shares_expires_at ON album_shares (expires_at);
    CREATE INDEX IF NOT EXISTS idx_smart_albums_name ON smart_albums (name);
    CREATE INDEX IF NOT EXISTS idx_smart_album_members_album_id ON smart_album_members (album_id);
    CREATE INDEX IF NOT EXISTS idx_smart_album_match_records_album_id ON smart_album_match_records (album_id);
    CREATE INDEX IF NOT EXISTS idx_smart_album_match_records_run_id ON smart_album_match_records (run_id);
    CREATE INDEX IF NOT EXISTS idx_smart_album_rules_enabled_priority ON smart_album_rules (enabled, priority DESC);
`;

/** 历史上以 ALTER TABLE 追加的列：[表, 列, 定义] */
const LEGACY_COLUMNS: ReadonlyArray<readonly [string, string, string]> = [
  ["system_config", "preload_before", "INTEGER NOT NULL DEFAULT 2"],
  ["system_config", "preload_after", "INTEGER NOT NULL DEFAULT 3"],
  ["system_config", "default_image_quality_preset", "TEXT NOT NULL DEFAULT 'original'"],
  ["system_config", "page_transition_mode", "TEXT NOT NULL DEFAULT 'page'"],
  ["system_config", "album_list_item_min_width_mobile", "INTEGER NOT NULL DEFAULT 160"],
  ["system_config", "album_list_item_min_width_desktop", "INTEGER NOT NULL DEFAULT 300"],
  ["system_config", "album_detail_item_min_width_mobile", "INTEGER NOT NULL DEFAULT 160"],
  ["system_config", "album_detail_item_min_width_desktop", "INTEGER NOT NULL DEFAULT 300"],
  ["albums", "assets_fingerprint", "TEXT"],
  ["albums", "is_favorite", "INTEGER NOT NULL DEFAULT 0"],
  ["smart_album_ai_configs", "provider", "TEXT NOT NULL DEFAULT 'openai'"],
  ["smart_album_ai_configs", "api_endpoint", "TEXT NOT NULL DEFAULT 'https://api.openai.com/v1'"],
  ["smart_album_ai_configs", "api_token", "TEXT"],
  ["smart_album_ai_configs", "api_model", "TEXT NOT NULL DEFAULT 'gpt-4.1-mini'"],
  ["smart_album_rules", "source_engine", "TEXT NOT NULL DEFAULT 'manual'"],
  ["smart_album_rules", "generated_normalized_key", "TEXT"],
  ["smart_album_rules", "generated_confidence", "REAL"],
  ["smart_album_rules", "generated_reason", "TEXT"],
  ["smart_album_rules", "generated_run_id", "TEXT"]
];

export const baselineMigration = (db: Database.Database): void => {
  db.exec(BASELINE_SCHEMA);
  for (const [table, column, definition] of LEGACY_COLUMNS) addColumnIfMissing(db, table, column, definition);

  try {
    db.exec(`
      INSERT OR IGNORE INTO system_config (id, enable_polling, polling_interval, default_image_quality_preset, page_transition_mode, album_list_item_min_width_mobile, album_list_item_min_width_desktop, album_detail_item_min_width_mobile, album_detail_item_min_width_desktop, created_at, updated_at)
      VALUES ('system_config', 1, 60000, 'original', 'page', 160, 300, 160, 300, datetime('now'), datetime('now'));
    `);
  } catch (error) {
    throw new Error(`baseline 迁移初始化数据失败: ${(error as Error).message}`);
  }

  try {
    // SELECT * 避免旧库/新库列差异导致整段补丁被跳过
    const existingConfig = db.prepare("SELECT * FROM system_config WHERE id = 'system_config'").get() as Record<string, unknown> | undefined;
    if (existingConfig) {
      if (existingConfig.preload_before === 0 && existingConfig.preload_after === 0) {
        db.prepare("UPDATE system_config SET preload_before = 2, preload_after = 3 WHERE id = 'system_config'").run();
      }
      if (!existingConfig.default_image_quality_preset) {
        db.prepare("UPDATE system_config SET default_image_quality_preset = 'original' WHERE id = 'system_config'").run();
      }
      if (existingConfig.page_transition_mode !== 'page' && existingConfig.page_transition_mode !== 'normal') {
        db.prepare("UPDATE system_config SET page_transition_mode = 'page' WHERE id = 'system_config'").run();
      }
      if (existingConfig.album_list_item_min_width_mobile === 160 && existingConfig.album_list_item_min_width_desktop === 300 && typeof existingConfig.album_list_item_min_width === 'number') {
        db.prepare("UPDATE system_config SET album_list_item_min_width_mobile = 160, album_list_item_min_width_desktop = ? WHERE id = 'system_config'").run(existingConfig.album_list_item_min_width);
      }
      if (existingConfig.album_detail_item_min_width_mobile === 160 && existingConfig.album_detail_item_min_width_desktop === 300 && typeof existingConfig.album_detail_item_min_width === 'number') {
        db.prepare("UPDATE system_config SET album_detail_item_min_width_mobile = 160, album_detail_item_min_width_desktop = ? WHERE id = 'system_config'").run(existingConfig.album_detail_item_min_width);
      }
      if (existingConfig.album_list_item_min_width_mobile === existingConfig.album_list_item_min_width_desktop && existingConfig.album_list_item_min_width_mobile !== 160) {
        db.prepare("UPDATE system_config SET album_list_item_min_width_mobile = 160 WHERE id = 'system_config'").run();
      }
      if (existingConfig.album_detail_item_min_width_mobile === existingConfig.album_detail_item_min_width_desktop && existingConfig.album_detail_item_min_width_mobile !== 160) {
        db.prepare("UPDATE system_config SET album_detail_item_min_width_mobile = 160 WHERE id = 'system_config'").run();
      }
    }
  } catch (error) {
    throw new Error(`baseline 迁移初始化数据失败: ${(error as Error).message}`);
  }

  try {
    db.exec(`
      INSERT OR IGNORE INTO smart_album_ai_configs (
        id,
        enabled,
        mode,
        provider,
        api_endpoint,
        api_token,
        api_model,
        min_confidence_auto_apply,
        min_cluster_album_count,
        max_suggestions_per_run,
        allow_alias_merge,
        allow_cross_root_grouping,
        excluded_tokens_json,
        preferred_scopes_json,
        review_required_below_confidence,
        created_at,
        updated_at
      )
      VALUES (
        'smart_album_ai_config',
        0,
        'assist',
        'openai',
        'https://api.openai.com/v1',
        NULL,
        'gpt-4.1-mini',
        0.9,
        3,
        50,
        1,
        1,
        '[]',
        '["albumName","sourcePath"]',
        0.9,
        datetime('now'),
        datetime('now')
      );
    `);
  } catch (error) {
    throw new Error(`baseline 迁移初始化数据失败: ${(error as Error).message}`);
  }

  try {
    db.exec(`
      UPDATE smart_album_rules
      SET source_engine = COALESCE(source_engine, 'manual')
      WHERE source_engine IS NULL OR TRIM(source_engine) = '';
    `);
  } catch (error) {
    throw new Error(`baseline 迁移初始化数据失败: ${(error as Error).message}`);
  }
};
