import { lookup as lookupMimeType } from "mime-types";
import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { getAssetDetail } from "../services/album-service.js";
import { ensureThumbnail, readOriginalImage } from "../services/thumbnail-service.js";

export const assetRoutes: FastifyPluginAsync = async (app) => {
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

    try {
      const thumbnail = await ensureThumbnail(assetId);
      reply.type(thumbnail.mimeType);
      return reply.send(await app.readFile(thumbnail.filePath));
    } catch {
      return reply.status(404).send({
        code: 4002,
        message: "asset not found"
      });
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
};
