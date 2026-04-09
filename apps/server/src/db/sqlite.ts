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

    CREATE INDEX IF NOT EXISTS idx_albums_library_root_id ON albums (library_root_id);
    CREATE INDEX IF NOT EXISTS idx_albums_name ON albums (name);
    CREATE INDEX IF NOT EXISTS idx_albums_source_type ON albums (source_type);
    CREATE INDEX IF NOT EXISTS idx_assets_album_id ON assets (album_id);
    CREATE INDEX IF NOT EXISTS idx_assets_album_sort ON assets (album_id, sort_index);
    CREATE INDEX IF NOT EXISTS idx_assets_thumbnail_key ON assets (thumbnail_key);
  `);
};

export const getDb = () => {
  if (!database) {
    ensureDbDir();
    database = new Database(env.sqlitePath);
    bootstrap(database);
  }

  return database;
};
