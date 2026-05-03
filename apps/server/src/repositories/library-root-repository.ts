import { getDb } from "../db/sqlite.js";
import type { LibraryRootRecord } from "../types/store.js";
import { rowToLibraryRoot } from "./sqlite-mappers.js";

export const listLibraryRootsDb = (): LibraryRootRecord[] => {
  const db = getDb();
  return db.prepare("SELECT * FROM library_roots ORDER BY name ASC").all().map((row: unknown) => rowToLibraryRoot(row as Record<string, unknown>));
};

export const findLibraryRootByPathDb = (targetPath: string): LibraryRootRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM library_roots WHERE path = ? LIMIT 1").get(targetPath) as Record<string, unknown> | undefined;
  return row ? rowToLibraryRoot(row) : null;
};

export const findLibraryRootByIdDb = (id: string): LibraryRootRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM library_roots WHERE id = ? LIMIT 1").get(id) as Record<string, unknown> | undefined;
  return row ? rowToLibraryRoot(row) : null;
};

export const upsertLibraryRootDb = (root: LibraryRootRecord) => {
  const db = getDb();
  db.prepare(`
    INSERT INTO library_roots (id, name, path, enabled, last_scanned_at, created_at, updated_at)
    VALUES (@id, @name, @path, @enabled, @lastScannedAt, @createdAt, @updatedAt)
    ON CONFLICT(path) DO UPDATE SET
      name = excluded.name,
      enabled = excluded.enabled,
      last_scanned_at = excluded.last_scanned_at,
      updated_at = excluded.updated_at
  `).run({
    ...root,
    enabled: root.enabled ? 1 : 0
  });
};

export const deleteLibraryRootDb = (id: string) => {
  const db = getDb();
  const albumIds = db.prepare("SELECT id FROM albums WHERE library_root_id = ?").all(id) as Array<{ id: string }>;
  const deleteThumbnail = db.prepare("DELETE FROM thumbnails WHERE asset_id IN (SELECT id FROM assets WHERE album_id = ?)");
  const deleteAsset = db.prepare("DELETE FROM assets WHERE album_id = ?");
  const deleteAlbum = db.prepare("DELETE FROM albums WHERE id = ?");
  const deleteLibraryRoot = db.prepare("DELETE FROM library_roots WHERE id = ?");
  const transaction = db.transaction(() => {
    for (const album of albumIds) {
      deleteThumbnail.run(album.id);
      deleteAsset.run(album.id);
      deleteAlbum.run(album.id);
    }
    deleteLibraryRoot.run(id);
  });
  transaction();
};

export const updateLibraryRootDb = (id: string, updates: { name?: string; path?: string; enabled?: boolean }) => {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM library_roots WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    return null;
  }

  const current = rowToLibraryRoot(existing);
  const updated = {
    ...current,
    name: updates.name ?? current.name,
    path: updates.path ?? current.path,
    enabled: updates.enabled ?? current.enabled,
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    UPDATE library_roots
    SET name = @name, path = @path, enabled = @enabled, updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id: updated.id,
    name: updated.name,
    path: updated.path,
    enabled: updated.enabled ? 1 : 0,
    updatedAt: updated.updatedAt
  });

  return updated;
};

export const clearLibraryDataDb = (libraryRootId: string) => {
  const db = getDb();
  const albumIds = db.prepare("SELECT id FROM albums WHERE library_root_id = ?").all(libraryRootId) as Array<{ id: string }>;
  const deleteThumbnail = db.prepare("DELETE FROM thumbnails WHERE asset_id IN (SELECT id FROM assets WHERE album_id = ?)");
  const deleteAsset = db.prepare("DELETE FROM assets WHERE album_id = ?");
  const deleteAlbum = db.prepare("DELETE FROM albums WHERE id = ?");
  const transaction = db.transaction(() => {
    for (const album of albumIds) {
      deleteThumbnail.run(album.id);
      deleteAsset.run(album.id);
      deleteAlbum.run(album.id);
    }
  });
  transaction();
};
