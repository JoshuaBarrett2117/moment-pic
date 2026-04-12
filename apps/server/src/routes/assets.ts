import fs from "node:fs";
import { lookup as lookupMimeType } from "mime-types";
import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { deleteAsset, getAssetDetail } from "../services/album-service.js";
import { ensureThumbnail, readOriginalImage } from "../services/thumbnail-service.js";

export const assetRoutes: FastifyPluginAsync = async (app) => {
  const THUMBNAIL_REQUEST_MAX_ACTIVE = 24;
  const THUMBNAIL_REQUEST_MAX_QUEUE = 320;
  const THUMBNAIL_REQUEST_QUEUE_TIMEOUT_MS = 8000;
  let activeThumbnailRequests = 0;
  const thumbnailWaitQueue: Array<{
    resolve: () => void;
    timeout: NodeJS.Timeout;
  }> = [];

  const getThumbnailQueueStats = () => ({
    active: activeThumbnailRequests,
    queued: thumbnailWaitQueue.length
  });

  const tryWakeNextThumbnailRequest = () => {
    const next = thumbnailWaitQueue.shift();
    if (!next) {
      return;
    }
    clearTimeout(next.timeout);
    activeThumbnailRequests += 1;
    next.resolve();
  };

  const acquireThumbnailRequestSlot = async (): Promise<(() => void) | null> => {
    if (activeThumbnailRequests < THUMBNAIL_REQUEST_MAX_ACTIVE) {
      activeThumbnailRequests += 1;
    } else {
      if (thumbnailWaitQueue.length >= THUMBNAIL_REQUEST_MAX_QUEUE) {
        return null;
      }
      const acquired = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          const index = thumbnailWaitQueue.findIndex((item) => item.timeout === timeout);
          if (index >= 0) {
            thumbnailWaitQueue.splice(index, 1);
          }
          resolve(false);
        }, THUMBNAIL_REQUEST_QUEUE_TIMEOUT_MS);

        thumbnailWaitQueue.push({
          timeout,
          resolve: () => resolve(true)
        });
      });

      if (!acquired) {
        return null;
      }
    }

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      activeThumbnailRequests = Math.max(0, activeThumbnailRequests - 1);
      tryWakeNextThumbnailRequest();
    };
  };

  const normalizeHeader = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  app.get("/api/v1/assets/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const asset = await getAssetDetail(assetId);

    if (!asset) {
      return reply.status(404).send({
        code: 4002,
        message: "asset not found"
      });
    }

    return ok(asset);
  });

  app.get("/api/v1/assets/:assetId/thumbnail", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const query = request.query as { w?: string; h?: string; format?: "webp" | "jpeg" };
    const requestedWidth = query.w ? Number(query.w) : undefined;
    const requestedHeight = query.h ? Number(query.h) : undefined;
    const acceptHeader = normalizeHeader(request.headers.accept) ?? "";
    const preferredFormat =
      query.format === "webp" || query.format === "jpeg"
        ? query.format
        : acceptHeader.includes("image/webp")
          ? "webp"
          : "jpeg";
    const releaseSlot = await acquireThumbnailRequestSlot();
    if (!releaseSlot) {
      const stats = getThumbnailQueueStats();
      reply.header("Retry-After", "1");
      reply.header("X-Thumb-Active", String(stats.active));
      reply.header("X-Thumb-Queued", String(stats.queued));
      return reply.status(503).send({
        code: 5003,
        message: "thumbnail service busy, retry later"
      });
    }
    const slotStats = getThumbnailQueueStats();
    reply.header("X-Thumb-Active", String(slotStats.active));
    reply.header("X-Thumb-Queued", String(slotStats.queued));

    try {
      try {
        const thumbnail = await ensureThumbnail(assetId, {
          width: requestedWidth,
          height: requestedHeight,
          format: preferredFormat
        });
        const etag = `"thumb-${thumbnail.cacheKey}"`;
        const ifNoneMatch = normalizeHeader(request.headers["if-none-match"]);
        if (ifNoneMatch === etag) {
          return reply.status(304).send();
        }

        const stat = await fs.promises.stat(thumbnail.filePath);
        reply.header("ETag", etag);
        reply.header("Last-Modified", stat.mtime.toUTCString());
        reply.header("Cache-Control", "private, max-age=86400, must-revalidate");
        reply.type(thumbnail.mimeType);
        return reply.send(fs.createReadStream(thumbnail.filePath));
      } catch {
        try {
          const { asset, buffer } = await readOriginalImage(assetId);
          const mimeType = lookupMimeType(asset.name) || "application/octet-stream";
          reply.type(mimeType);
          return reply.send(buffer);
        } catch {
          return reply.status(404).send({
            code: 4002,
            message: "asset not found"
          });
        }
      }
    } finally {
      releaseSlot();
    }
  });

  app.get("/api/v1/assets/:assetId/original", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };

    try {
      const { asset, buffer } = await readOriginalImage(assetId);
      const mimeType = lookupMimeType(asset.name) || "application/octet-stream";
      reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(asset.name)}"`);
      reply.type(mimeType);
      return reply.send(buffer);
    } catch {
      return reply.status(404).send({
        code: 4002,
        message: "asset not found"
      });
    }
  });

  app.delete("/api/v1/assets/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const success = await deleteAsset(assetId);

    if (!success) {
      return reply.status(404).send({
        code: 4002,
        message: "asset not found"
      });
    }

    return ok({ success: true });
  });
};
