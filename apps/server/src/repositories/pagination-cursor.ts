/**
 * 游标分页的不透明游标（base64url(JSON)）。
 * - 图集列表：记录排序字段、方向、最后一行的排序值与 id，配合 (col, id) 行值键集分页；
 * - 图集内图片：记录最后一行的 sort_index 与 id。
 * 游标格式错误、或与本次请求的排序不一致时抛 InvalidCursorError，由路由映射为 400。
 */
export type AlbumSortBy = "name" | "updatedAt" | "assetCount";
export type SortOrder = "asc" | "desc";

export class InvalidCursorError extends Error {
  constructor(reason: string) {
    super(`invalid cursor: ${reason}`);
    this.name = "InvalidCursorError";
  }
}

export type AlbumCursor = { sortBy: AlbumSortBy; order: SortOrder; value: string | number; id: string };
export type AssetCursor = { sortIndex: number; id: string };

const MAX_CURSOR_LENGTH = 2048;

const encode = (payload: unknown): string => Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

const decode = (cursor: string): Record<string, unknown> => {
  if (typeof cursor !== "string" || !cursor || cursor.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new InvalidCursorError("malformed");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCursorError("malformed");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new InvalidCursorError("malformed");
  return parsed as Record<string, unknown>;
};

export const encodeAlbumCursor = (cursor: AlbumCursor): string =>
  encode({ s: cursor.sortBy, o: cursor.order, v: cursor.value, id: cursor.id });

export const decodeAlbumCursor = (cursor: string, expected: { sortBy: AlbumSortBy; order: SortOrder }): AlbumCursor => {
  const raw = decode(cursor);
  const { s, o, v, id } = raw;
  if (s !== "name" && s !== "updatedAt" && s !== "assetCount") throw new InvalidCursorError("malformed");
  if (o !== "asc" && o !== "desc") throw new InvalidCursorError("malformed");
  if (typeof id !== "string" || !id) throw new InvalidCursorError("malformed");
  const valueOk = s === "assetCount" ? typeof v === "number" && Number.isFinite(v) : typeof v === "string";
  if (!valueOk) throw new InvalidCursorError("malformed");
  if (s !== expected.sortBy || o !== expected.order) throw new InvalidCursorError("sort mismatch");
  return { sortBy: s, order: o, value: v as string | number, id };
};

export const encodeAssetCursor = (cursor: AssetCursor): string => encode({ k: "asset", i: cursor.sortIndex, id: cursor.id });

export const decodeAssetCursor = (cursor: string): AssetCursor => {
  const { k, i, id } = decode(cursor);
  if (k !== "asset" || typeof i !== "number" || !Number.isInteger(i) || typeof id !== "string" || !id) {
    throw new InvalidCursorError("malformed");
  }
  return { sortIndex: i, id };
};
