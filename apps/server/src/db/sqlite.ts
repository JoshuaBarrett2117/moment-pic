import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { env } from "../config/env.js";

let database: Database.Database | null = null;

const ensureDbDir = () => {
  fs.mkdirSync(path.dirname(env.sqlitePath), { recursive: true });
};

const bootstrap = (db: Database.Database) => {
  db.pragma("journal_mode = WAL");
  db.exec(`
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
      album_list_item_min_width_mobile INTEGER NOT NULL DEFAULT 160,
      album_list_item_min_width_desktop INTEGER NOT NULL DEFAULT 300,
      album_detail_item_min_width_mobile INTEGER NOT NULL DEFAULT 160,
      album_detail_item_min_width_desktop INTEGER NOT NULL DEFAULT 300,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS album_views (
      id TEXT PRIMARY KEY,
      album_id TEXT NOT NULL,
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS smart_album_ai_configs (
      id TEXT PRIMARY KEY DEFAULT 'smart_album_ai_config',
      enabled INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'assist',
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
    CREATE INDEX IF NOT EXISTS idx_album_views_album_id ON album_views (album_id);
    CREATE INDEX IF NOT EXISTS idx_album_views_viewed_at ON album_views (viewed_at);
    CREATE INDEX IF NOT EXISTS idx_smart_albums_name ON smart_albums (name);
    CREATE INDEX IF NOT EXISTS idx_smart_album_members_album_id ON smart_album_members (album_id);
    CREATE INDEX IF NOT EXISTS idx_smart_album_match_records_album_id ON smart_album_match_records (album_id);
    CREATE INDEX IF NOT EXISTS idx_smart_album_match_records_run_id ON smart_album_match_records (run_id);
    CREATE INDEX IF NOT EXISTS idx_smart_album_rules_enabled_priority ON smart_album_rules (enabled, priority DESC);
  `);

  try {
    db.exec('ALTER TABLE system_config ADD COLUMN preload_before INTEGER NOT NULL DEFAULT 2');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE system_config ADD COLUMN preload_after INTEGER NOT NULL DEFAULT 3');
  } catch (e) {}
  try {
    db.exec("ALTER TABLE system_config ADD COLUMN default_image_quality_preset TEXT NOT NULL DEFAULT 'original'");
  } catch (e) {}
  try {
    db.exec('ALTER TABLE system_config ADD COLUMN album_list_item_min_width_mobile INTEGER NOT NULL DEFAULT 160');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE system_config ADD COLUMN album_list_item_min_width_desktop INTEGER NOT NULL DEFAULT 300');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE system_config ADD COLUMN album_detail_item_min_width_mobile INTEGER NOT NULL DEFAULT 160');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE system_config ADD COLUMN album_detail_item_min_width_desktop INTEGER NOT NULL DEFAULT 300');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE albums ADD COLUMN assets_fingerprint TEXT');
  } catch (e) {}

  try {
    db.exec(`
      INSERT OR IGNORE INTO system_config (id, enable_polling, polling_interval, default_image_quality_preset, album_list_item_min_width_mobile, album_list_item_min_width_desktop, album_detail_item_min_width_mobile, album_detail_item_min_width_desktop, created_at, updated_at)
      VALUES ('system_config', 1, 60000, 'original', 160, 300, 160, 300, datetime('now'), datetime('now'));
    `);
  } catch (e) {}

  try {
    const existingConfig = db.prepare("SELECT preload_before, preload_after, default_image_quality_preset, album_list_item_min_width, album_detail_item_min_width, album_list_item_min_width_mobile, album_list_item_min_width_desktop, album_detail_item_min_width_mobile, album_detail_item_min_width_desktop FROM system_config WHERE id = 'system_config'").get() as { preload_before: number; preload_after: number; default_image_quality_preset: string | null; album_list_item_min_width: number; album_detail_item_min_width: number; album_list_item_min_width_mobile: number; album_list_item_min_width_desktop: number; album_detail_item_min_width_mobile: number; album_detail_item_min_width_desktop: number } | undefined;
    if (existingConfig) {
      if (existingConfig.preload_before === 0 && existingConfig.preload_after === 0) {
        db.prepare("UPDATE system_config SET preload_before = 2, preload_after = 3 WHERE id = 'system_config'").run();
      }
      if (!existingConfig.default_image_quality_preset) {
        db.prepare("UPDATE system_config SET default_image_quality_preset = 'original' WHERE id = 'system_config'").run();
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
  } catch (e) {}

  try {
    db.exec(`
      INSERT OR IGNORE INTO smart_album_ai_configs (
        id,
        enabled,
        mode,
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
  } catch (e) {}
};

export const getDb = () => {
  if (!database) {
    ensureDbDir();
    database = new Database(env.sqlitePath);
    bootstrap(database);
  }

  return database;
};
