import { getDb } from "../db/sqlite.js";
import { makeId } from "./ids.js";
import { rowToAlbumView } from "./sqlite-mappers.js";

export type SystemConfigRecord = {
  id: string;
  enablePolling: boolean;
  pollingInterval: number;
  preloadBefore: number;
  preloadAfter: number;
  defaultImageQualityPreset: "low" | "balanced" | "high" | "original";
  pageTransitionMode: "page" | "normal";
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
    page_transition_mode: string;
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
      row.default_image_quality_preset === "balanced" ||
      row.default_image_quality_preset === "high" ||
      row.default_image_quality_preset === "original"
        ? row.default_image_quality_preset
        : "original",
    pageTransitionMode: row.page_transition_mode === "normal" ? "normal" : "page",
    albumListItemMinWidthMobile: row.album_list_item_min_width_mobile,
    albumListItemMinWidthDesktop: row.album_list_item_min_width_desktop,
    albumDetailItemMinWidthMobile: row.album_detail_item_min_width_mobile,
    albumDetailItemMinWidthDesktop: row.album_detail_item_min_width_desktop,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export const updateSystemConfigDb = (updates: { enablePolling?: boolean; pollingInterval?: number; preloadBefore?: number; preloadAfter?: number; defaultImageQualityPreset?: "low" | "balanced" | "high" | "original"; pageTransitionMode?: "page" | "normal"; albumListItemMinWidthMobile?: number; albumListItemMinWidthDesktop?: number; albumDetailItemMinWidthMobile?: number; albumDetailItemMinWidthDesktop?: number }): SystemConfigRecord => {
  const db = getDb();
  const existing = getSystemConfigDb();

  const enablePolling = updates.enablePolling ?? existing.enablePolling;
  const pollingInterval = updates.pollingInterval ?? existing.pollingInterval;
  const preloadBefore = updates.preloadBefore ?? existing.preloadBefore;
  const preloadAfter = updates.preloadAfter ?? existing.preloadAfter;
  const defaultImageQualityPreset = updates.defaultImageQualityPreset ?? existing.defaultImageQualityPreset;
  const pageTransitionMode = updates.pageTransitionMode === "normal"
    ? "normal"
    : updates.pageTransitionMode === "page"
      ? "page"
      : existing.pageTransitionMode;
  const albumListItemMinWidthMobile = updates.albumListItemMinWidthMobile ?? existing.albumListItemMinWidthMobile;
  const albumListItemMinWidthDesktop = updates.albumListItemMinWidthDesktop ?? existing.albumListItemMinWidthDesktop;
  const albumDetailItemMinWidthMobile = updates.albumDetailItemMinWidthMobile ?? existing.albumDetailItemMinWidthMobile;
  const albumDetailItemMinWidthDesktop = updates.albumDetailItemMinWidthDesktop ?? existing.albumDetailItemMinWidthDesktop;

  db.prepare(`
    UPDATE system_config
    SET enable_polling = ?, polling_interval = ?, preload_before = ?, preload_after = ?, default_image_quality_preset = ?, page_transition_mode = ?, album_list_item_min_width_mobile = ?, album_list_item_min_width_desktop = ?, album_detail_item_min_width_mobile = ?, album_detail_item_min_width_desktop = ?, updated_at = datetime('now')
    WHERE id = 'system_config'
  `).run(
    enablePolling ? 1 : 0,
    pollingInterval,
    preloadBefore,
    preloadAfter,
    defaultImageQualityPreset,
    pageTransitionMode,
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
  db.prepare("INSERT INTO album_views (id, album_id, viewed_at) VALUES (?, ?, ?)").run(id, albumId, now);
};

export const listRecentAlbumViewsDb = (limit = 50) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT album_id, MAX(viewed_at) as viewed_at
    FROM album_views
    GROUP BY album_id
    ORDER BY MAX(viewed_at) DESC
    LIMIT ?
  `).all(limit) as { album_id: string; viewed_at: string }[];

  return rows.map((row) => rowToAlbumView(row));
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
