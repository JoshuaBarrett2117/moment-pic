import fs from "node:fs";
import { lookup as lookupMimeType } from "mime-types";
import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { deleteAsset, getAssetDetail } from "../services/album-service.js";
import { ensureThumbnail, readOriginalImage } from "../services/thumbnail-service.js";

export const assetRoutes: FastifyPluginAsync = async (app) => {
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
    const query = request.query as { w?: string; h?: string };
    const requestedWidth = query.w ? Number(query.w) : undefined;
    const requestedHeight = query.h ? Number(query.h) : undefined;

    try {
      const thumbnail = await ensureThumbnail(assetId, {
        width: requestedWidth,
        height: requestedHeight
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
