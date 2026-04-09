import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { deleteAlbum, getAlbumAssets, getAlbumDetail, listAlbums } from "../services/album-service.js";

export const albumRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/albums", async (request) => {
    const query = request.query as {
      page?: string;
      pageSize?: string;
      libraryRootId?: string;
      sourceType?: "folder" | "zip";
      keyword?: string;
      sortBy?: "name" | "updatedAt" | "assetCount";
      sortOrder?: "asc" | "desc";
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 24)));

    return ok(
      await listAlbums(page, pageSize, {
        libraryRootId: query.libraryRootId,
        sourceType: query.sourceType,
        keyword: query.keyword,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder
      })
    );
  });

  app.get("/api/v1/albums/:albumId", async (request, reply) => {
    const { albumId } = request.params as { albumId: string };
    const album = await getAlbumDetail(albumId);

    if (!album) {
      return reply.status(404).send({
        code: 4001,
        message: "album not found"
      });
    }

    return ok(album);
  });

  app.get("/api/v1/albums/:albumId/assets", async (request, reply) => {
    const { albumId } = request.params as { albumId: string };
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(300, Number(query.pageSize ?? 120)));
    const payload = await getAlbumAssets(albumId, page, pageSize);

    if (!payload) {
      return reply.status(404).send({
        code: 4001,
        message: "album not found"
      });
    }

    return ok(payload);
  });

  app.delete("/api/v1/albums/:albumId", async (request, reply) => {
    const { albumId } = request.params as { albumId: string };
    const success = await deleteAlbum(albumId);

    if (!success) {
      return reply.status(404).send({
        code: 4001,
        message: "album not found"
      });
    }

    return ok({ success: true });
  });
};
