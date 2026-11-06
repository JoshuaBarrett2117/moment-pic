import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { getSession } from "../lib/auth.js";
import { ok } from "../lib/api.js";
import { parseBoundedInteger } from "../lib/request-query.js";
import { getAlbumProgress, getContinueReading, saveAlbumProgress } from "../services/album-progress-service.js";

/** 阅读进度按登录用户隔离 */
const userIdOf = (request: FastifyRequest): string => {
  const session = request.authSession ?? getSession(request);
  if (!session) throw Object.assign(new Error("unauthorized"), { statusCode: 401 });
  return session.user.id;
};

export const albumProgressRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { limit?: string } }>("/api/v1/albums/continue", async (request) =>
    ok({ items: getContinueReading(userIdOf(request), parseBoundedInteger(request.query.limit, { defaultValue: 20, min: 1, max: 100 })) }));
  app.get<{ Params: { albumId: string } }>("/api/v1/albums/:albumId/progress", async (request) => ok(getAlbumProgress(userIdOf(request), request.params.albumId)));
  app.put<{ Params: { albumId: string }; Body: { assetId: string; assetIndex: number } }>("/api/v1/albums/:albumId/progress", {
    schema: { body: { type: "object", required: ["assetId", "assetIndex"], additionalProperties: false,
      properties: { assetId: { type: "string", minLength: 1 }, assetIndex: { type: "integer", minimum: 0 } } } }
  }, async (request) => ok(saveAlbumProgress(userIdOf(request), request.params.albumId, request.body)));
};
