import fs from "node:fs";
import { lookup as lookupMimeType } from "mime-types";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  assetVersion,
  mediaCacheControl,
  ORIGINAL_REVALIDATE,
  parseByteRange,
  replyNotModifiedIfFresh,
  VARIANT_REVALIDATE
} from "../lib/media-cache.js";
import { ThumbnailRequestGate } from "../services/thumbnail-request-gate.js";
import {
  ensurePreview,
  ensureThumbnail,
  openOriginalImage,
  planPreview,
  planThumbnail,
  type PreviewPreset
} from "../services/thumbnail-service.js";
import type { ThumbnailFit, ThumbnailFormat } from "../services/thumbnail-options.js";
import type { AssetRecord } from "../types/store.js";

/** 管理端与分享页共用一个生成闸门，匿名请求不能绕过它直接压 sharp。 */
export const thumbnailRequestGate = new ThumbnailRequestGate({
  maxActive: 8,
  maxQueue: 160,
  queueTimeoutMs: 8000
});

const lastModifiedOf = (asset: AssetRecord): string | null => {
  const ms = Number(asset.sourceMtime);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toUTCString() : null;
};

const sendBusy = (reply: FastifyReply) => {
  const stats = thumbnailRequestGate.getStats();
  reply.header("Retry-After", "1");
  reply.header("X-Thumb-Active", String(stats.active));
  reply.header("X-Thumb-Queued", String(stats.queued));
  return reply.status(503).send({ code: 5003, message: "thumbnail service busy, retry later" });
};

export type VariantRequest =
  | { kind: "thumbnail"; fit?: ThumbnailFit; width?: number; height?: number; format: ThumbnailFormat }
  | { kind: "preview"; preset?: PreviewPreset; format: ThumbnailFormat };

/**
 * 缩略图/预览：先按缓存键判断 304（不拿闸门、不查盘），未命中再排队生成。
 * 返回 null 表示生成失败，由调用方决定回退。
 */
export const sendVariant = async (
  request: FastifyRequest,
  reply: FastifyReply,
  asset: AssetRecord,
  variant: VariantRequest,
  signal: AbortSignal,
  onGenerateError: (error: unknown) => Promise<unknown>
) => {
  const plan = variant.kind === "thumbnail" ? planThumbnail(asset, variant) : planPreview(asset, variant);
  const etag = `"${variant.kind === "thumbnail" ? "thumb" : "preview"}-${plan.cacheKey}"`;
  const cacheControl = mediaCacheControl(request, assetVersion(asset), VARIANT_REVALIDATE);
  if (replyNotModifiedIfFresh(request, reply, { etag, cacheControl, vary: "Accept" })) return reply;

  const releaseSlot = await thumbnailRequestGate.acquire();
  if (!releaseSlot) return sendBusy(reply);
  const slotStats = thumbnailRequestGate.getStats();
  reply.header("X-Thumb-Active", String(slotStats.active));
  reply.header("X-Thumb-Queued", String(slotStats.queued));
  try {
    let result: { filePath: string; mimeType: string };
    try {
      result = variant.kind === "thumbnail"
        ? await ensureThumbnail(asset.id, { ...variant, asset, signal })
        : await ensurePreview(asset.id, { ...variant, asset, signal });
    } catch (error) {
      reply.removeHeader("ETag");
      reply.header("Cache-Control", "no-store");
      return await onGenerateError(error);
    }
    const stat = await fs.promises.stat(result.filePath);
    reply.header("Last-Modified", stat.mtime.toUTCString());
    reply.type(result.mimeType);
    return reply.send(fs.createReadStream(result.filePath));
  } finally {
    releaseSlot();
  }
};

/** 原图：ETag/Last-Modified/Cache-Control，If-None-Match 命中直接 304；目录图支持单段 Range。 */
export const sendOriginal = async (
  request: FastifyRequest,
  reply: FastifyReply,
  asset: AssetRecord,
  signal: AbortSignal,
  options: { inlineFilename?: boolean } = {}
) => {
  const version = assetVersion(asset);
  const etag = `"orig-${version}"`;
  const cacheControl = mediaCacheControl(request, version, ORIGINAL_REVALIDATE);
  const lastModified = lastModifiedOf(asset);
  if (lastModified) reply.header("Last-Modified", lastModified);
  if (replyNotModifiedIfFresh(request, reply, { etag, cacheControl })) return reply;

  const rangeHeader = Array.isArray(request.headers.range) ? request.headers.range[0] : request.headers.range;
  const ifRange = request.headers["if-range"];
  const rangeAllowed = !ifRange || ifRange === etag;
  const { body, sizeBytes, range } = await openOriginalImage(
    asset.id,
    signal,
    asset,
    rangeAllowed && rangeHeader ? (size) => parseByteRange(rangeHeader, size) : undefined
  );
  const mimeType = lookupMimeType(asset.name) || "application/octet-stream";
  if (asset.sourceType === "folder") reply.header("Accept-Ranges", "bytes");
  if (options.inlineFilename) reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(asset.name)}"`);
  if (range === "unsatisfiable") {
    reply.header("Content-Range", `bytes */${sizeBytes ?? 0}`);
    return reply.status(416).send();
  }
  if (range) {
    reply.status(206);
    reply.header("Content-Range", `bytes ${range.start}-${range.end}/${range.size}`);
  }
  if (sizeBytes !== null && Number.isFinite(sizeBytes)) reply.header("Content-Length", String(sizeBytes));
  reply.type(mimeType);
  return reply.send(body);
};
