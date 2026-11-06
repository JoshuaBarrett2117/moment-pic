import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { env } from "../config/env.js";
import { runMigrations } from "./migrations/index.js";

let database: Database.Database | null = null;

const ensureDbDir = () => {
  fs.mkdirSync(path.dirname(env.sqlitePath), { recursive: true });
};

const bootstrap = (db: Database.Database) => {
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 2000");
  runMigrations(db);
};

export const getDb = () => {
  if (!database) {
    ensureDbDir();
    database = new Database(env.sqlitePath);
    bootstrap(database);
  }

  return database;
};
