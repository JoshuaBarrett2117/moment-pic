import type { FastifyPluginAsync } from "fastify";
import { ok } from "../lib/api.js";
import { parseBoundedInteger } from "../lib/request-query.js";
import { getAlbumProgress, getContinueReading, saveAlbumProgress } from "../services/album-progress-service.js";

export const albumProgressRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { limit?: string } }>("/api/v1/albums/continue", async (request) =>
    ok({ items: getContinueReading(parseBoundedInteger(request.query.limit, { defaultValue: 20, min: 1, max: 100 })) }));
  app.get<{ Params: { albumId: string } }>("/api/v1/albums/:albumId/progress", async (request) => ok(getAlbumProgress(request.params.albumId)));
  app.put<{ Params: { albumId: string }; Body: { assetId: string; assetIndex: number } }>("/api/v1/albums/:albumId/progress", {
    schema: { body: { type: "object", required: ["assetId", "assetIndex"], additionalProperties: false,
      properties: { assetId: { type: "string", minLength: 1 }, assetIndex: { type: "integer", minimum: 0 } } } }
  }, async (request) => ok(saveAlbumProgress(request.params.albumId, request.body)));
};
