import fs from "node:fs";
import { lookup as lookupMimeType } from "mime-types";
import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { deleteAsset, getAssetDetail } from "../services/album-service.js";
import {
  AssetNotFoundError,
  ensurePreview,
  ensureThumbnail,
  openOriginalImage,
  OriginalAssetSourceMissingError
} from "../services/thumbnail-service.js";

export const assetRoutes: FastifyPluginAsync = async (app) => {
  const ASSET_REQUEST_MAX_ACTIVE = 6;
  const ASSET_REQUEST_MAX_QUEUE = 1024;
  const ASSET_REQUEST_QUEUE_TIMEOUT_MS = 120000;
  let activeAssetRequests = 0;
  const assetWaitQueue: Array<{
    resolve: () => void;
    timeout: NodeJS.Timeout;
  }> = [];

  const getAssetQueueStats = () => ({
    active: activeAssetRequests,
    queued: assetWaitQueue.length
  });

  const tryWakeNextAssetRequest = () => {
    const next = assetWaitQueue.shift();
    if (!next) {
      return;
    }
    clearTimeout(next.timeout);
    activeAssetRequests += 1;
    next.resolve();
  };

  const acquireAssetRequestSlot = async (): Promise<(() => void) | null> => {
    if (activeAssetRequests < ASSET_REQUEST_MAX_ACTIVE) {
      activeAssetRequests += 1;
    } else {
      if (assetWaitQueue.length >= ASSET_REQUEST_MAX_QUEUE) {
        return null;
      }
      const acquired = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          const index = assetWaitQueue.findIndex((item) => item.timeout === timeout);
          if (index >= 0) {
            assetWaitQueue.splice(index, 1);
          }
          resolve(false);
        }, ASSET_REQUEST_QUEUE_TIMEOUT_MS);

        assetWaitQueue.push({
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
      activeAssetRequests = Math.max(0, activeAssetRequests - 1);
      tryWakeNextAssetRequest();
    };
  };

  const normalizeHeader = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const sendAssetNotFound = (reply: any) =>
    reply.status(404).send({
      code: 4002,
      message: "asset not found"
    });

  const sendOriginalSourceMissing = (reply: any) =>
    reply.status(404).send({
      code: 4005,
      message: "original asset source not found"
    });

  const sendOriginalAssetFallback = async (assetId: string, reply: any) => {
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
    const requestedWidth = query.w ? Number(query.w) : undefined;
    const requestedHeight = query.h ? Number(query.h) : undefined;
    const acceptHeader = normalizeHeader(request.headers.accept) ?? "";
    const preferredFormat =
      query.format === "webp" || query.format === "jpeg"
        ? query.format
        : acceptHeader.includes("image/webp")
          ? "webp"
          : "jpeg";
    const releaseSlot = await acquireAssetRequestSlot();
    if (!releaseSlot) {
      const stats = getAssetQueueStats();
      reply.header("Retry-After", "1");
      reply.header("X-Asset-Active", String(stats.active));
      reply.header("X-Asset-Queued", String(stats.queued));
      return reply.status(503).send({
        code: 5003,
        message: "asset service busy, retry later"
      });
    }
    const slotStats = getAssetQueueStats();
    reply.header("X-Asset-Active", String(slotStats.active));
    reply.header("X-Asset-Queued", String(slotStats.queued));

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
    const releaseSlot = await acquireAssetRequestSlot();
    if (!releaseSlot) {
      const stats = getAssetQueueStats();
      reply.header("Retry-After", "1");
      reply.header("X-Asset-Active", String(stats.active));
      reply.header("X-Asset-Queued", String(stats.queued));
      return reply.status(503).send({
        code: 5003,
        message: "asset service busy, retry later"
      });
    }
    const slotStats = getAssetQueueStats();
    reply.header("X-Asset-Active", String(slotStats.active));
    reply.header("X-Asset-Queued", String(slotStats.queued));

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
    } finally {
      releaseSlot();
    }
  });

  app.get("/api/v1/assets/:assetId/preview", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const query = request.query as { preset?: "low" | "balanced" | "high"; format?: "webp" | "jpeg" };
    const acceptHeader = normalizeHeader(request.headers.accept) ?? "";
    const preferredFormat =
      query.format === "webp" || query.format === "jpeg"
        ? query.format
        : acceptHeader.includes("image/webp")
          ? "webp"
          : "jpeg";
    const releaseSlot = await acquireAssetRequestSlot();
    if (!releaseSlot) {
      const stats = getAssetQueueStats();
      reply.header("Retry-After", "1");
      reply.header("X-Asset-Active", String(stats.active));
      reply.header("X-Asset-Queued", String(stats.queued));
      return reply.status(503).send({
        code: 5003,
        message: "asset service busy, retry later"
      });
    }
    const slotStats = getAssetQueueStats();
    reply.header("X-Asset-Active", String(slotStats.active));
    reply.header("X-Asset-Queued", String(slotStats.queued));

    try {
      try {
        const preview = await ensurePreview(assetId, {
          preset: query.preset,
          format: preferredFormat
        });
        const etag = `"preview-${preview.cacheKey}"`;
        const ifNoneMatch = normalizeHeader(request.headers["if-none-match"]);
        if (ifNoneMatch === etag) {
          return reply.status(304).send();
        }

        const stat = await fs.promises.stat(preview.filePath);
        reply.header("ETag", etag);
        reply.header("Last-Modified", stat.mtime.toUTCString());
        reply.header("Cache-Control", "private, max-age=86400, must-revalidate");
        reply.type(preview.mimeType);
        return reply.send(fs.createReadStream(preview.filePath));
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
