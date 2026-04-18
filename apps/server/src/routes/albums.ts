import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { deleteAlbum, getAlbumAssets, getAlbumDetail, listAlbums, recordAlbumView, getRecentAlbums } from "../services/album-service.js";
import { rescanAlbum, ScanAlbumNotFoundError, ScanAlbumSourceInvalidError, ScanLibraryRootNotFoundError } from "../services/library-scanner.js";

export const albumRoutes: FastifyPluginAsync = async (app) => {
  const normalizeHeader = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  app.get("/api/v1/albums/recent", async (request, reply) => {
    const query = request.query as { limit?: string };
    const limit = Math.max(1, Math.min(100, Number(query.limit ?? 50)));
    const payload = await getRecentAlbums(limit);

    return ok({ items: payload });
  });

  app.post("/api/v1/albums/:albumId/view", async (request, reply) => {
    const { albumId } = request.params as { albumId: string };
    await recordAlbumView(albumId);
    return ok({ success: true });
  });

  app.get("/api/v1/albums", async (request, reply) => {
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
    const payload = await listAlbums(page, pageSize, {
      libraryRootId: query.libraryRootId,
      sourceType: query.sourceType,
      keyword: query.keyword,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder
    });
    const etag = `"albums-${crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex")}"`;
    const ifNoneMatch = normalizeHeader(request.headers["if-none-match"]);
    if (ifNoneMatch === etag) {
      return reply.status(304).send();
    }

    const latestUpdatedAt = payload.items.length > 0 ? payload.items[0].updatedAt : null;
    reply.header("ETag", etag);
    reply.header("Cache-Control", "private, max-age=2, must-revalidate");
    if (latestUpdatedAt) {
      const lastModified = new Date(latestUpdatedAt);
      if (!Number.isNaN(lastModified.getTime())) {
        reply.header("Last-Modified", lastModified.toUTCString());
      }
    }

    return ok(payload);
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

    await recordAlbumView(albumId);

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

  app.post("/api/v1/albums/:albumId/rescan", async (request, reply) => {
    const { albumId } = request.params as { albumId: string };

    try {
      const payload = await rescanAlbum(albumId);
      return ok(payload);
    } catch (error) {
      if (error instanceof ScanAlbumNotFoundError) {
        return reply.status(404).send({
          code: 4001,
          message: "album not found"
        });
      }

      if (error instanceof ScanLibraryRootNotFoundError || error instanceof ScanAlbumSourceInvalidError) {
        return reply.status(400).send({
          code: 4006,
          message: error.message
        });
      }

      throw error;
    }
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
