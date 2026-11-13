import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

/** 资产内容版本：源文件 mtime + 大小 + 压缩包条目，写进图片 URL 的 `v` 参数。 */
export const assetVersion = (asset: { sourceMtime: string | null; sizeBytes: string | null; zipEntryPath?: string | null }): string =>
  crypto.createHash("sha1").update(`${asset.sourceMtime ?? ""}|${asset.sizeBytes ?? ""}|${asset.zipEntryPath ?? ""}`).digest("hex").slice(0, 12);

export const withVersion = (url: string, version: string): string => `${url}${url.includes("?") ? "&" : "?"}v=${version}`;

const normalizeHeader = (value: string | string[] | undefined) => (Array.isArray(value) ? value.join(",") : value);

/** If-None-Match 弱比较：兼容 `*`、逗号分隔列表和 `W/` 前缀。 */
export const etagMatches = (ifNoneMatch: string | string[] | undefined, etag: string): boolean => {
  const header = normalizeHeader(ifNoneMatch);
  if (!header) return false;
  const target = etag.replace(/^W\//, "");
  return header.split(",").some((candidate) => {
    const value = candidate.trim();
    return value === "*" || value.replace(/^W\//, "") === target;
  });
};

/** URL 带的版本与当前内容一致时可以永久缓存；否则短缓存并要求重新验证。 */
export const mediaCacheControl = (request: FastifyRequest, version: string, fallback: string): string => {
  const requested = (request.query as { v?: unknown } | undefined)?.v;
  return requested === version ? "private, max-age=31536000, immutable" : fallback;
};

export const VARIANT_REVALIDATE = "private, max-age=86400, must-revalidate";
export const ORIGINAL_REVALIDATE = "private, max-age=3600, must-revalidate";

/** 在拿生成闸门之前判断 304。命中时已写好响应头，调用方直接 return。 */
export const replyNotModifiedIfFresh = (
  request: FastifyRequest,
  reply: FastifyReply,
  input: { etag: string; cacheControl: string; vary?: string }
): boolean => {
  reply.header("ETag", input.etag);
  reply.header("Cache-Control", input.cacheControl);
  if (input.vary) reply.header("Vary", input.vary);
  if (!etagMatches(request.headers["if-none-match"], input.etag)) return false;
  reply.status(304).send();
  return true;
};

/** 解析单段 `bytes=a-b` Range；多段或非法返回 null（按整文件 200 返回），越界返回 "unsatisfiable"。 */
export const parseByteRange = (header: string | undefined, size: number): { start: number; end: number } | "unsatisfiable" | null => {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
};
