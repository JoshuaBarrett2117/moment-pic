import type Database from "better-sqlite3";

import { addColumnIfMissing } from "./helpers.js";

/**
 * 内网默认画质（user_version 7 → 8）：system_config 增加 lan_image_quality_preset，默认原图。
 * 原有 default_image_quality_preset 语义变为「外网默认画质」。列已存在时跳过（幂等）。
 */
export const lanImageQualityMigration = (db: Database.Database): void => {
  addColumnIfMissing(db, "system_config", "lan_image_quality_preset", "TEXT NOT NULL DEFAULT 'original'");
};
