import { reconcileAlbumProgressDb } from "./album-progress-repository.js";
import { getDb, stmt } from "../db/sqlite.js";
import type { AlbumRecord, AlbumShareRecord, AssetRecord, ThumbnailRecord } from "../types/store.js";
import { rowToAlbum, rowToAlbumShare, rowToAsset, rowToThumbnail } from "./sqlite-mappers.js";
import {
  type AlbumSortBy,
  type SortOrder,
  decodeAlbumCursor,
  decodeAssetCursor,
  encodeAlbumCursor,
  encodeAssetCursor
} from "./pagination-cursor.js";

export type { AlbumSortBy, SortOrder } from "./pagination-cursor.js";
export { InvalidCursorError } from "./pagination-cursor.js";

export type AlbumListFilters = {
  libraryRootId?: string;
  sourceType?: "folder" | "zip";
  keyword?: string;
  sortBy?: AlbumSortBy;
  sortOrder?: SortOrder;
  favoriteOnly?: boolean;
};

/** cursor 优先（键集分页）；无 cursor 时按 page 走 OFFSET（向后兼容）。 */
export type AlbumListQuery = { page?: number; cursor?: string; pageSize: number };

const toAlbumDbParams = (album: AlbumRecord) => ({
  ...album,
  isFavorite: album.isFavorite ? 1 : 0
});

export const insertAlbumWithAssetsDb = (album: AlbumRecord, assets: AssetRecord[]) => {
  const db = getDb();
  const insertAlbum = db.prepare(`
    INSERT INTO albums (id, library_root_id, name, source_type, source_path, source_mtime, assets_fingerprint, cover_asset_id, asset_count, scan_status, error_message, is_favorite, created_at, updated_at)
    VALUES (@id, @libraryRootId, @name, @sourceType, @sourcePath, @sourceMtime, @assetsFingerprint, @coverAssetId, @assetCount, @scanStatus, @errorMessage, @isFavorite, @createdAt, @updatedAt)
  `);
  const insertAsset = db.prepare(`
    INSERT INTO assets (id, album_id, name, extension, source_type, source_path, relative_path, zip_entry_path, sort_index, width, height, size_bytes, source_mtime, thumbnail_key, created_at, updated_at)
    VALUES (@id, @albumId, @name, @extension, @sourceType, @sourcePath, @relativePath, @zipEntryPath, @sortIndex, @width, @height, @sizeBytes, @sourceMtime, @thumbnailKey, @createdAt, @updatedAt)
  `);
  const transaction = db.transaction(() => {
    insertAlbum.run(toAlbumDbParams(album));
    for (const asset of assets) {
      insertAsset.run(asset);
    }
  });
  transaction();
};

type ReplacedAlbum = { existingAlbumId: string | null; album: AlbumRecord; assets: AssetRecord[] };

/**
 * 按 source_path 幂等写入（防御性兜底）：若同一路径已有另一条图集记录（例如来自协调器之外的并发写入），
 * 沿用库里已有的 id、收藏与创建时间，替换其内容，而不是再插入一条触发 UNIQUE(source_path) 冲突。
 */
const adoptExistingAlbumBySourcePath = (item: ReplacedAlbum, row: Record<string, unknown> | undefined): ReplacedAlbum => {
  if (!row) return item;
  const existingId = String(row.id);
  // existingAlbumId 本身就是按 source_path 匹配到的记录，只有“新图集”才可能撞路径。
  if (existingId === item.album.id || item.existingAlbumId) return item;
  return {
    existingAlbumId: existingId,
    album: { ...item.album, id: existingId, isFavorite: Number(row.is_favorite) === 1, createdAt: String(row.created_at) },
    assets: item.assets.map((asset) => ({ ...asset, albumId: existingId }))
  };
};

export const applyLibraryRootScanDiffDb = (input: {
  removedAlbumIds: string[];
  replacedAlbums: Array<{
    existingAlbumId: string | null;
    album: AlbumRecord;
    assets: AssetRecord[];
  }>;
}) => {
  const db = getDb();
  const deleteThumbnailByAlbumId = db.prepare("DELETE FROM thumbnails WHERE asset_id IN (SELECT id FROM assets WHERE album_id = ?)");
  const deleteAssetsByAlbumId = db.prepare("DELETE FROM assets WHERE album_id = ?");
  const deleteAlbumById = db.prepare("DELETE FROM albums WHERE id = ?");
  const deleteProgressByAlbumId = db.prepare("DELETE FROM album_progress WHERE album_id = ?");
  const deleteSharesByAlbumId = db.prepare("DELETE FROM album_shares WHERE album_id = ?");
  const insertAlbum = db.prepare(`
    INSERT INTO albums (id, library_root_id, name, source_type, source_path, source_mtime, assets_fingerprint, cover_asset_id, asset_count, scan_status, error_message, is_favorite, created_at, updated_at)
    VALUES (@id, @libraryRootId, @name, @sourceType, @sourcePath, @sourceMtime, @assetsFingerprint, @coverAssetId, @assetCount, @scanStatus, @errorMessage, @isFavorite, @createdAt, @updatedAt)
  `);
  const insertAsset = db.prepare(`
    INSERT INTO assets (id, album_id, name, extension, source_type, source_path, relative_path, zip_entry_path, sort_index, width, height, size_bytes, source_mtime, thumbnail_key, created_at, updated_at)
    VALUES (@id, @albumId, @name, @extension, @sourceType, @sourcePath, @relativePath, @zipEntryPath, @sortIndex, @width, @height, @sizeBytes, @sourceMtime, @thumbnailKey, @createdAt, @updatedAt)
  `);

  const findAlbumBySourcePath = db.prepare("SELECT id, is_favorite, created_at FROM albums WHERE source_path = ? LIMIT 1");

  const transaction = db.transaction(() => {
    for (const albumId of input.removedAlbumIds) {
      deleteProgressByAlbumId.run(albumId);
      deleteSharesByAlbumId.run(albumId);
      deleteThumbnailByAlbumId.run(albumId);
      deleteAssetsByAlbumId.run(albumId);
      deleteAlbumById.run(albumId);
    }

    for (const original of input.replacedAlbums) {
      const item = adoptExistingAlbumBySourcePath(original, findAlbumBySourcePath.get(original.album.sourcePath) as Record<string, unknown> | undefined);
      if (item.existingAlbumId) {
        deleteThumbnailByAlbumId.run(item.existingAlbumId);
        deleteAssetsByAlbumId.run(item.existingAlbumId);
        deleteAlbumById.run(item.existingAlbumId);
      }

      insertAlbum.run(toAlbumDbParams(item.album));
      for (const asset of item.assets) {
        insertAsset.run(asset);
      }
      reconcileAlbumProgressDb(item.album.id);
    }
  });

  transaction();
};

export const updateAlbumScanStatusDb = (albumId: string, status: "ready" | "error", message: string | null): void => {
  getDb().prepare("UPDATE albums SET scan_status = ?, error_message = ? WHERE id = ?").run(status, message, albumId);
};

export type AlbumScanStatusUpdate = { albumId: string; status: "ready" | "error"; message: string | null };

/** 小批同步事务只写发生变化的状态，避免在媒体 I/O 期间持有数据库写锁。 */
export const updateAlbumScanStatusBatchDb = (updates: AlbumScanStatusUpdate[]): number => {
  const db = getDb();
  const statement = db.prepare(`UPDATE albums SET scan_status = @status, error_message = @message
    WHERE id = @albumId AND (scan_status <> @status OR IFNULL(error_message, '') <> IFNULL(@message, ''))`);
  const writeBatch = db.transaction((batch: AlbumScanStatusUpdate[]) =>
    batch.reduce((changed, update) => changed + statement.run(update).changes, 0));
  let changed = 0;
  for (let offset = 0; offset < updates.length; offset += 1000) changed += writeBatch(updates.slice(offset, offset + 1000));
  return changed;
};

const FTS_TRIGRAM_MIN_CHARS = 3;

/** 作为 FTS5 短语查询：整体加双引号，内部双引号按 FTS 语法转义，避免用户输入被解析为查询运算符。 */
export const toFtsPhrase = (keyword: string): string => `"${keyword.replaceAll('"', '""')}"`;

const escapeLike = (keyword: string): string => keyword.replace(/[\\%_]/g, (char) => `\\${char}`);

const ALBUM_SORT_COLUMNS: Record<AlbumSortBy, "name" | "updated_at" | "asset_count"> = {
  name: "name",
  updatedAt: "updated_at",
  assetCount: "asset_count"
};

/** includeTotal=false 时跳过 COUNT（游标翻页由服务层复用首页总数），total 返回 null。 */
export const listAlbumsDb = (query: AlbumListQuery, input?: AlbumListFilters, options: { includeTotal?: boolean } = {}) => {
  const db = getDb();
  const conditions: string[] = [];
  const pageSize = Math.max(1, Math.trunc(query.pageSize));
  const sortBy = input?.sortBy ?? "updatedAt";
  const sortOrder = input?.sortOrder ?? "desc";
  const column = ALBUM_SORT_COLUMNS[sortBy];
  const direction = sortOrder === "asc" ? "ASC" : "DESC";
  // 先解析游标：格式错误/排序不一致直接抛 InvalidCursorError，不触库
  const cursor = query.cursor ? decodeAlbumCursor(query.cursor, { sortBy, order: sortOrder }) : null;
  const params: Record<string, unknown> = {
    // 多取一行判断是否还有下一页
    limit: pageSize + 1,
    offset: cursor ? 0 : (Math.max(1, Math.trunc(query.page ?? 1)) - 1) * pageSize
  };

  if (input?.libraryRootId) {
    conditions.push("library_root_id = @libraryRootId");
    params.libraryRootId = input.libraryRootId;
  }

  if (input?.sourceType) {
    conditions.push("source_type = @sourceType");
    params.sourceType = input.sourceType;
  }

  const keyword = input?.keyword?.trim();
  if (keyword) {
    if ([...keyword].length >= FTS_TRIGRAM_MIN_CHARS) {
      // trigram 全文索引：任意子串匹配，含中文
      conditions.push("rowid IN (SELECT rowid FROM albums_fts WHERE albums_fts MATCH @keywordMatch)");
      params.keywordMatch = toFtsPhrase(keyword);
    } else {
      conditions.push("name LIKE @keyword ESCAPE '\\'");
      params.keyword = `%${escapeLike(keyword)}%`;
    }
  }

  if (input?.favoriteOnly) {
    conditions.push("is_favorite = 1");
  }

  const filterWhere = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  // 键集条件：(排序列, id) 行值比较，与 ORDER BY 列和方向严格一致，保证同值行不重不漏
  const pageConditions = cursor
    ? [...conditions, `(${column}, id) ${sortOrder === "asc" ? ">" : "<"} (@cursorValue, @cursorId)`]
    : conditions;
  if (cursor) {
    params.cursorValue = cursor.value;
    params.cursorId = cursor.id;
  }
  const pageWhere = pageConditions.length > 0 ? `WHERE ${pageConditions.join(" AND ")}` : "";
  const orderBy = `${column} ${direction}, id ${direction}`;

  // 延迟关联：先在索引上定位当前页的 id，再回表取整行，深分页不再为跳过的行读取整行数据
  const rows = db
    .prepare(`SELECT albums.* FROM albums JOIN (SELECT id FROM albums ${pageWhere} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset) AS page USING (id) ORDER BY ${orderBy}`)
    .all(params)
    .map((row: unknown) => rowToAlbum(row as Record<string, unknown>));
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items.at(-1);
  const nextCursor = hasMore && last
    ? encodeAlbumCursor({ sortBy, order: sortOrder, value: last[sortBy], id: last.id })
    : null;
  const countParams = Object.fromEntries(Object.entries(params).filter(([key]) => key !== "cursorValue" && key !== "cursorId" && key !== "limit" && key !== "offset"));
  if (options.includeTotal === false) return { items, total: null, nextCursor };
  const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM albums ${filterWhere}`).get(countParams) as { total: number };
  return { items, total: totalRow.total as number | null, nextCursor };
};

export const listAlbumsByLibraryRootIdDb = (libraryRootId: string): AlbumRecord[] => {
  const db = getDb();
  return db
    .prepare("SELECT * FROM albums WHERE library_root_id = ? ORDER BY name ASC")
    .all(libraryRootId)
    .map((row: unknown) => rowToAlbum(row as Record<string, unknown>));
};

export const findAlbumByIdDb = (albumId: string): AlbumRecord | null => {
  const row = stmt("SELECT * FROM albums WHERE id = ? LIMIT 1").get(albumId) as Record<string, unknown> | undefined;
  return row ? rowToAlbum(row) : null;
};

export const updateAlbumFavoriteDb = (albumId: string, isFavorite: boolean, updatedAt: string): AlbumRecord | null => {
  const db = getDb();
  db.prepare("UPDATE albums SET is_favorite = ?, updated_at = ? WHERE id = ?").run(isFavorite ? 1 : 0, updatedAt, albumId);
  return findAlbumByIdDb(albumId);
};

export const listAssetsByAlbumIdDb = (albumId: string, page?: number, pageSize?: number): AssetRecord[] => {
  const db = getDb();
  if (page && pageSize) {
    return db.prepare("SELECT * FROM assets WHERE album_id = ? ORDER BY sort_index ASC, id ASC LIMIT ? OFFSET ?").all(albumId, pageSize, (page - 1) * pageSize).map((row: unknown) => rowToAsset(row as Record<string, unknown>));
  }

  return db.prepare("SELECT * FROM assets WHERE album_id = ? ORDER BY sort_index ASC, id ASC").all(albumId).map((row: unknown) => rowToAsset(row as Record<string, unknown>));
};

/** 图集内图片分页：cursor 优先（(sort_index, id) 键集），否则按 page 走 OFFSET；多取一行生成 nextCursor。 */
export const listAssetsPageByAlbumIdDb = (
  albumId: string,
  query: { page?: number; cursor?: string; pageSize: number }
): { items: AssetRecord[]; nextCursor: string | null } => {
  const pageSize = Math.max(1, Math.trunc(query.pageSize));
  const cursor = query.cursor ? decodeAssetCursor(query.cursor) : null;
  const rows = (cursor
    ? stmt("SELECT * FROM assets WHERE album_id = ? AND (sort_index, id) > (?, ?) ORDER BY sort_index ASC, id ASC LIMIT ?")
      .all(albumId, cursor.sortIndex, cursor.id, pageSize + 1)
    : stmt("SELECT * FROM assets WHERE album_id = ? ORDER BY sort_index ASC, id ASC LIMIT ? OFFSET ?")
      .all(albumId, pageSize + 1, (Math.max(1, Math.trunc(query.page ?? 1)) - 1) * pageSize)
  ).map((row: unknown) => rowToAsset(row as Record<string, unknown>));
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? encodeAssetCursor({ sortIndex: last.sortIndex, id: last.id }) : null };
};

/** 扫描比对所需的最小列。 */
export type ComparableAssetRecord = Pick<AssetRecord, "name" | "extension" | "sourcePath" | "relativePath" | "zipEntryPath" | "sortIndex" | "sizeBytes" | "sourceMtime" | "width" | "height">;

/** 一次性按 album_id 分组加载某图库根下目录图集的资产（只取比对列），供扫描复用，避免每个图集各查两次。 */
export const listComparableFolderAssetsByLibraryRootDb = (libraryRootId: string): Map<string, ComparableAssetRecord[]> => {
  const grouped = new Map<string, ComparableAssetRecord[]>();
  const rows = getDb().prepare(`
    SELECT assets.album_id, assets.name, assets.extension, assets.source_path, assets.relative_path, assets.zip_entry_path,
      assets.sort_index, assets.size_bytes, assets.source_mtime, assets.width, assets.height
    FROM assets JOIN albums ON albums.id = assets.album_id
    WHERE albums.library_root_id = ? AND albums.source_type = 'folder'
    ORDER BY assets.album_id, assets.sort_index ASC, assets.id ASC
  `).iterate(libraryRootId) as IterableIterator<Record<string, unknown>>;
  for (const row of rows) {
    const albumId = String(row.album_id);
    let list = grouped.get(albumId);
    if (!list) { list = []; grouped.set(albumId, list); }
    list.push({
      name: String(row.name),
      extension: String(row.extension),
      sourcePath: String(row.source_path),
      relativePath: row.relative_path ? String(row.relative_path) : null,
      zipEntryPath: row.zip_entry_path ? String(row.zip_entry_path) : null,
      sortIndex: Number(row.sort_index),
      sizeBytes: row.size_bytes ? String(row.size_bytes) : null,
      sourceMtime: row.source_mtime ? String(row.source_mtime) : null,
      width: row.width === null || row.width === undefined ? null : Number(row.width),
      height: row.height === null || row.height === undefined ? null : Number(row.height)
    });
  }
  return grouped;
};

export const countAssetsByAlbumIdDb = (albumId: string): number => {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS total FROM assets WHERE album_id = ?").get(albumId) as { total: number };
  return row.total;
};

export const listAlbumCoverAssetIdsDb = (libraryRootId?: string, limit = 2000): string[] => {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 10000));

  if (libraryRootId) {
    const rows = db
      .prepare(
        "SELECT cover_asset_id FROM albums WHERE library_root_id = ? AND cover_asset_id IS NOT NULL ORDER BY updated_at DESC, name ASC LIMIT ?"
      )
      .all(libraryRootId, safeLimit) as Array<Record<string, unknown>>;
    return rows.map((row) => String(row.cover_asset_id));
  }

  const rows = db
    .prepare("SELECT cover_asset_id FROM albums WHERE cover_asset_id IS NOT NULL ORDER BY updated_at DESC, name ASC LIMIT ?")
    .all(safeLimit) as Array<Record<string, unknown>>;
  return rows.map((row) => String(row.cover_asset_id));
};

export const findAssetByIdDb = (assetId: string): AssetRecord | null => {
  const row = stmt("SELECT * FROM assets WHERE id = ? LIMIT 1").get(assetId) as Record<string, unknown> | undefined;
  return row ? rowToAsset(row) : null;
};

export const updateAssetMetadataDb = (assetId: string, input: { width: number | null; height: number | null; thumbnailKey: string | null; updatedAt: string }) => {
  const db = getDb();
  db.prepare("UPDATE assets SET width = @width, height = @height, thumbnail_key = @thumbnailKey, updated_at = @updatedAt WHERE id = @assetId").run({ assetId, ...input });
};

export const findThumbnailByAssetIdDb = (assetId: string): ThumbnailRecord | null => {
  const row = stmt("SELECT * FROM thumbnails WHERE asset_id = ? LIMIT 1").get(assetId) as Record<string, unknown> | undefined;
  return row ? rowToThumbnail(row) : null;
};

export const upsertThumbnailDb = (thumbnail: ThumbnailRecord) => {
  const db = getDb();
  db.prepare(`
    INSERT INTO thumbnails (id, asset_id, cache_key, format, width, height, file_path, status, created_at, updated_at)
    VALUES (@id, @assetId, @cacheKey, @format, @width, @height, @filePath, @status, @createdAt, @updatedAt)
    ON CONFLICT(asset_id) DO UPDATE SET
      cache_key = excluded.cache_key,
      format = excluded.format,
      width = excluded.width,
      height = excluded.height,
      file_path = excluded.file_path,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(thumbnail);
};

export const deleteAlbumDb = (albumId: string) => {
  const db = getDb();
  const deleteThumbnail = db.prepare("DELETE FROM thumbnails WHERE asset_id IN (SELECT id FROM assets WHERE album_id = ?)");
  const deleteAsset = db.prepare("DELETE FROM assets WHERE album_id = ?");
  const deleteAlbum = db.prepare("DELETE FROM albums WHERE id = ?");
  const deleteProgress = db.prepare("DELETE FROM album_progress WHERE album_id = ?");
  const deleteShares = db.prepare("DELETE FROM album_shares WHERE album_id = ?");
  const transaction = db.transaction(() => {
    deleteProgress.run(albumId);
    deleteShares.run(albumId);
    deleteThumbnail.run(albumId);
    deleteAsset.run(albumId);
    deleteAlbum.run(albumId);
  });
  transaction();
};

export const insertAlbumShareDb = (share: AlbumShareRecord): AlbumShareRecord => {
  const db = getDb();
  db.prepare(`
    INSERT INTO album_shares (id, album_id, token, password_hash, expires_at, created_at)
    VALUES (@id, @albumId, @token, @passwordHash, @expiresAt, @createdAt)
  `).run(share);
  return share;
};

export const findAlbumShareByTokenDb = (token: string): AlbumShareRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT id, album_id, token, password_hash, expires_at, created_at FROM album_shares WHERE token = ? LIMIT 1").get(token) as Record<string, unknown> | undefined;
  return row ? rowToAlbumShare(row) : null;
};

/** 只返回未过期的分享（读路径用，不写库）。 */
export const findActiveAlbumShareByTokenDb = (token: string, nowIso: string): AlbumShareRecord | null => {
  const row = getDb().prepare("SELECT id, album_id, token, password_hash, expires_at, created_at FROM album_shares WHERE token = ? AND expires_at > ? LIMIT 1").get(token, nowIso) as Record<string, unknown> | undefined;
  return row ? rowToAlbumShare(row) : null;
};

export const updateAlbumSharePasswordDb = (shareId: string, hash: string): boolean => {
  return getDb().prepare("UPDATE album_shares SET password_hash = ? WHERE id = ? AND expires_at > ?").run(hash, shareId, new Date().toISOString()).changes > 0;
};

export const deleteExpiredAlbumSharesDb = (nowIso: string): void => {
  const db = getDb();
  db.prepare("DELETE FROM album_shares WHERE expires_at <= ?").run(nowIso);
};

export const deleteAlbumShareDb = (shareId: string): void => {
  const db = getDb();
  db.prepare("DELETE FROM album_shares WHERE id = ?").run(shareId);
};

export const listActiveAlbumSharesDb = (nowIso: string): Array<AlbumShareRecord & {
  albumName: string;
  albumCoverAssetId: string | null;
  albumAssetCount: number;
}> => {
  const db = getDb();
  return db
    .prepare(`
      SELECT
        album_shares.id, album_shares.album_id, album_shares.token,
        album_shares.password_hash, album_shares.expires_at, album_shares.created_at,
        albums.name AS album_name,
        albums.cover_asset_id AS album_cover_asset_id,
        albums.asset_count AS album_asset_count
      FROM album_shares
      INNER JOIN albums ON albums.id = album_shares.album_id
      WHERE album_shares.expires_at > ?
      ORDER BY album_shares.created_at DESC
    `)
    .all(nowIso)
    .map((row: unknown) => {
      const current = row as Record<string, unknown>;
      return {
        ...rowToAlbumShare(current),
        albumName: String(current.album_name),
        albumCoverAssetId: current.album_cover_asset_id ? String(current.album_cover_asset_id) : null,
        albumAssetCount: Number(current.album_asset_count)
      };
    });
};

export const isAssetInAlbumDb = (albumId: string, assetId: string): boolean => {
  const row = stmt("SELECT 1 AS matched FROM assets WHERE album_id = ? AND id = ? LIMIT 1").get(albumId, assetId) as { matched: number } | undefined;
  return row?.matched === 1;
};

export const deleteAssetDb = (assetId: string) => {
  const db = getDb();
  const asset = db.prepare("SELECT album_id FROM assets WHERE id = ?").get(assetId) as { album_id: string } | undefined;
  if (!asset) {
    return;
  }

  const deleteThumbnail = db.prepare("DELETE FROM thumbnails WHERE asset_id = ?");
  const deleteAsset = db.prepare("DELETE FROM assets WHERE id = ?");

  const transaction = db.transaction(() => {
    deleteThumbnail.run(assetId);
    deleteAsset.run(assetId);

    const album = db.prepare("SELECT id, cover_asset_id, asset_count FROM albums WHERE id = ?").get(asset.album_id) as { id: string; cover_asset_id: string | null; asset_count: number } | undefined;
    if (album) {
      const remainingAssets = db.prepare("SELECT id FROM assets WHERE album_id = ? ORDER BY sort_index LIMIT 1").get(asset.album_id) as { id: string } | undefined;
      const newCoverAssetId = remainingAssets?.id ?? null;
      const newAssetCount = album.asset_count - 1;
      db.prepare("UPDATE albums SET cover_asset_id = ?, asset_count = ?, updated_at = ? WHERE id = ?")
        .run(newCoverAssetId, newAssetCount, new Date().toISOString(), album.id);
    }
  });
  transaction();
};

export const updateAlbumScanMetadataDb = (
  albumId: string,
  input: {
    sourceMtime: string | null;
    assetsFingerprint: string | null;
  }
) => {
  const db = getDb();
  // 只同步扫描元数据，不改 updated_at：内容未变的图集不应因重扫而“变新”。
  db.prepare(
    "UPDATE albums SET source_mtime = @sourceMtime, assets_fingerprint = @assetsFingerprint WHERE id = @albumId"
  ).run({
    albumId,
    ...input
  });
};

export const listAlbumsForSmartRuleScopeDb = (): Array<{
  id: string;
  name: string;
  sourcePath: string;
  assetCount: number;
  coverAssetId: string | null;
  updatedAt: string;
  sourceType: "folder" | "zip";
}> => {
  const db = getDb();
  return db
    .prepare("SELECT id, name, source_path, asset_count, cover_asset_id, updated_at, source_type FROM albums ORDER BY updated_at DESC, name ASC")
    .all()
    .map((row: unknown) => {
      const current = row as Record<string, unknown>;
      return {
        id: String(current.id),
        name: String(current.name),
        sourcePath: String(current.source_path),
        assetCount: Number(current.asset_count),
        coverAssetId: current.cover_asset_id ? String(current.cover_asset_id) : null,
        updatedAt: String(current.updated_at),
        sourceType: current.source_type === "zip" ? "zip" : "folder"
      };
    });
};

export const listAssetNamesByAlbumIdDb = (albumId: string): string[] => {
  const db = getDb();
  const rows = db.prepare("SELECT name FROM assets WHERE album_id = ? ORDER BY sort_index ASC").all(albumId) as Array<{ name: string }>;
  return rows.map((row) => row.name);
};

/** 智能相册规则计算用：一次性按图集分组载入全部资产名，避免每个图集、每条规则各查一次。 */
export const listAssetNamesGroupedByAlbumDb = (): Map<string, string[]> => {
  const db = getDb();
  const grouped = new Map<string, string[]>();
  const statement = db.prepare("SELECT album_id, name FROM assets ORDER BY album_id ASC, sort_index ASC");
  for (const row of statement.iterate() as Iterable<{ album_id: string; name: string }>) {
    const list = grouped.get(row.album_id);
    if (list) list.push(row.name);
    else grouped.set(row.album_id, [row.name]);
  }
  return grouped;
};

/** 按 id 批量取图集，分块避开 SQLite 变量上限。 */
export const findAlbumsByIdsDb = (albumIds: readonly string[]): Map<string, AlbumRecord> => {
  const db = getDb();
  const result = new Map<string, AlbumRecord>();
  const unique = Array.from(new Set(albumIds));
  for (let offset = 0; offset < unique.length; offset += 500) {
    const chunk = unique.slice(offset, offset + 500);
    const rows = db.prepare(`SELECT * FROM albums WHERE id IN (${chunk.map(() => "?").join(",")})`).all(...chunk) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const album = rowToAlbum(row);
      result.set(album.id, album);
    }
  }
  return result;
};

/** 只回填缺失尺寸，不触碰缩略图键及图集时间；媒体探测必须在调用前结束。 */
export const updateAssetDimensionsDb = (updates: Array<{ assetId: string; width: number; height: number }>): number => {
  const db = getDb();
  const statement = db.prepare(`UPDATE assets SET width=@width, height=@height, updated_at=@updatedAt
    WHERE id=@assetId AND (width IS NULL OR height IS NULL)`);
  const updatedAt = new Date().toISOString();
  const writeBatch = db.transaction((batch: typeof updates) => batch.reduce((count, update) => count + statement.run({ ...update, updatedAt }).changes, 0));
  let changed = 0;
  for (let offset = 0; offset < updates.length; offset += 500) changed += writeBatch(updates.slice(offset, offset + 500));
  return changed;
};
