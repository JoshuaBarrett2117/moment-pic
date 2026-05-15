import fs from "node:fs";
import { lookup as lookupMimeType } from "mime-types";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { ok } from "../lib/api.js";
import { parseBoundedInteger, parseEnumValue } from "../lib/request-query.js";
import { deleteAsset, getAssetDetail } from "../services/album-service.js";
import { ThumbnailRequestGate } from "../services/thumbnail-request-gate.js";
import {
  AssetNotFoundError,
  ensurePreview,
  ensureThumbnail,
  openOriginalImage,
  OriginalAssetSourceMissingError
} from "../services/thumbnail-service.js";

const thumbnailRequestGate = new ThumbnailRequestGate({
  maxActive: 24,
  maxQueue: 320,
  queueTimeoutMs: 8000
});

const normalizeHeader = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const resolvePreferredFormat = (
  requestedFormat: "webp" | "jpeg" | undefined,
  acceptHeader: string
): "webp" | "jpeg" => {
  if (requestedFormat === "webp" || requestedFormat === "jpeg") {
    return requestedFormat;
  }

  return acceptHeader.includes("image/webp") ? "webp" : "jpeg";
};

const applyVariantCacheHeaders = async (
  reply: FastifyReply,
  input: {
    etagPrefix: "thumb" | "preview";
    cacheKey: string;
    filePath: string;
    mimeType: string;
  },
  ifNoneMatch: string | undefined
) => {
  const etag = `"${input.etagPrefix}-${input.cacheKey}"`;
  if (ifNoneMatch === etag) {
    return reply.status(304).send();
  }

  const stat = await fs.promises.stat(input.filePath);
  reply.header("ETag", etag);
  reply.header("Last-Modified", stat.mtime.toUTCString());
  reply.header("Cache-Control", "private, max-age=86400, must-revalidate");
  reply.type(input.mimeType);
  return reply.send(fs.createReadStream(input.filePath));
};

export const assetRoutes: FastifyPluginAsync = async (app) => {
  const sendAssetNotFound = (reply: FastifyReply) =>
    reply.status(404).send({
      code: 4002,
      message: "asset not found"
    });

  const sendOriginalSourceMissing = (reply: FastifyReply) =>
    reply.status(404).send({
      code: 4005,
      message: "original asset source not found"
    });

  const sendOriginalAssetFallback = async (assetId: string, reply: FastifyReply) => {
    const { asset, body, sizeBytes } = await openOriginalImage(assetId);
    const mimeType = lookupMimeType(asset.name) || "application/octet-stream";
    if (sizeBytes !== null && Number.isFinite(sizeBytes)) {
      reply.header("Content-Length", String(sizeBytes));
    }
    reply.type(mimeType);
    return reply.send(body);
  };

  app.get("/api/v1/assets/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const asset = await getAssetDetail(assetId);

    if (!asset) {
      return sendAssetNotFound(reply);
    }

    return ok(asset);
  });

  app.get("/api/v1/assets/:assetId/thumbnail", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const query = request.query as { w?: string; h?: string; format?: "webp" | "jpeg" };
    const requestedWidth = query.w ? parseBoundedInteger(query.w, { defaultValue: 0, min: 1, max: 4096 }) : undefined;
    const requestedHeight = query.h ? parseBoundedInteger(query.h, { defaultValue: 0, min: 1, max: 4096 }) : undefined;
    const acceptHeader = normalizeHeader(request.headers.accept) ?? "";
    const preferredFormat = resolvePreferredFormat(parseEnumValue(query.format, ["webp", "jpeg"] as const), acceptHeader);
    const releaseSlot = await thumbnailRequestGate.acquire();
    if (!releaseSlot) {
      const stats = thumbnailRequestGate.getStats();
      reply.header("Retry-After", "1");
      reply.header("X-Thumb-Active", String(stats.active));
      reply.header("X-Thumb-Queued", String(stats.queued));
      return reply.status(503).send({
        code: 5003,
        message: "thumbnail service busy, retry later"
      });
    }
    const slotStats = thumbnailRequestGate.getStats();
    reply.header("X-Thumb-Active", String(slotStats.active));
    reply.header("X-Thumb-Queued", String(slotStats.queued));

    try {
      try {
        const thumbnail = await ensureThumbnail(assetId, {
          width: requestedWidth,
          height: requestedHeight,
          format: preferredFormat
        });
        const ifNoneMatch = normalizeHeader(request.headers["if-none-match"]);
        return applyVariantCacheHeaders(reply, {
          etagPrefix: "thumb",
          cacheKey: thumbnail.cacheKey,
          filePath: thumbnail.filePath,
          mimeType: thumbnail.mimeType
        }, ifNoneMatch);
      } catch (error) {
        if (error instanceof AssetNotFoundError) {
          return sendAssetNotFound(reply);
        }
        if (error instanceof OriginalAssetSourceMissingError) {
          return sendOriginalSourceMissing(reply);
        }
        try {
          return await sendOriginalAssetFallback(assetId, reply);
        } catch (fallbackError) {
          if (fallbackError instanceof AssetNotFoundError) {
            return sendAssetNotFound(reply);
          }
          if (fallbackError instanceof OriginalAssetSourceMissingError) {
            return sendOriginalSourceMissing(reply);
          }
          throw fallbackError;
        }
      }
    } finally {
      releaseSlot();
    }
  });

  app.get("/api/v1/assets/:assetId/original", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };

    try {
      const { asset, body, sizeBytes } = await openOriginalImage(assetId);
      const mimeType = lookupMimeType(asset.name) || "application/octet-stream";
      reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(asset.name)}"`);
      if (sizeBytes !== null && Number.isFinite(sizeBytes)) {
        reply.header("Content-Length", String(sizeBytes));
      }
      reply.type(mimeType);
      return reply.send(body);
    } catch (error) {
      if (error instanceof AssetNotFoundError) {
        return sendAssetNotFound(reply);
      }
      if (error instanceof OriginalAssetSourceMissingError) {
        return sendOriginalSourceMissing(reply);
      }
      throw error;
    }
  });

  app.get("/api/v1/assets/:assetId/preview", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const query = request.query as { preset?: "low" | "balanced" | "high"; format?: "webp" | "jpeg" };
    const acceptHeader = normalizeHeader(request.headers.accept) ?? "";
    const preferredFormat = resolvePreferredFormat(parseEnumValue(query.format, ["webp", "jpeg"] as const), acceptHeader);
    const releaseSlot = await thumbnailRequestGate.acquire();
    if (!releaseSlot) {
      const stats = thumbnailRequestGate.getStats();
      reply.header("Retry-After", "1");
      reply.header("X-Thumb-Active", String(stats.active));
      reply.header("X-Thumb-Queued", String(stats.queued));
      return reply.status(503).send({
        code: 5003,
        message: "thumbnail service busy, retry later"
      });
    }
    const slotStats = thumbnailRequestGate.getStats();
    reply.header("X-Thumb-Active", String(slotStats.active));
    reply.header("X-Thumb-Queued", String(slotStats.queued));

    try {
      try {
        const preview = await ensurePreview(assetId, {
          preset: parseEnumValue(query.preset, ["low", "balanced", "high"] as const),
          format: preferredFormat
        });
        const ifNoneMatch = normalizeHeader(request.headers["if-none-match"]);
        return applyVariantCacheHeaders(reply, {
          etagPrefix: "preview",
          cacheKey: preview.cacheKey,
          filePath: preview.filePath,
          mimeType: preview.mimeType
        }, ifNoneMatch);
      } catch (error) {
        if (error instanceof AssetNotFoundError) {
          return sendAssetNotFound(reply);
        }
        if (error instanceof OriginalAssetSourceMissingError) {
          return sendOriginalSourceMissing(reply);
        }
        try {
          return await sendOriginalAssetFallback(assetId, reply);
        } catch (fallbackError) {
          if (fallbackError instanceof AssetNotFoundError) {
            return sendAssetNotFound(reply);
          }
          if (fallbackError instanceof OriginalAssetSourceMissingError) {
            return sendOriginalSourceMissing(reply);
          }
          throw fallbackError;
        }
      }
    } finally {
      releaseSlot();
    }
  });

  app.delete("/api/v1/assets/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const success = await deleteAsset(assetId);

    if (!success) {
      return sendAssetNotFound(reply);
    }

    return ok({ success: true });
  });
};
