import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { parseBoundedInteger, parseEnumValue, parseOptionalString } from "../lib/request-query.js";
import { deleteAlbum, getAlbumAssets, getAlbumDetail, listAlbums, recordAlbumView, getRecentAlbums } from "../services/album-service.js";
import { DirectoryAlbumPathInvalidError, DirectoryAlbumRootNotFoundError, listDirectoryAlbums } from "../services/directory-album-service.js";
import { rescanAlbum, ScanAlbumNotFoundError, ScanAlbumSourceInvalidError, ScanLibraryRootNotFoundError } from "../services/library-scanner.js";

export const albumRoutes: FastifyPluginAsync = async (app) => {
  const normalizeHeader = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  app.get("/api/v1/albums/recent", async (request, reply) => {
    const query = request.query as { limit?: string };
    const limit = parseBoundedInteger(query.limit, { defaultValue: 50, min: 1, max: 100 });
    const payload = await getRecentAlbums(limit);

    return ok({ items: payload });
  });

  app.get("/api/v1/albums/directory-tree", async (request, reply) => {
    const query = request.query as { libraryRootId?: string; relativePath?: string };

    try {
      return ok(await listDirectoryAlbums({
        libraryRootId: query.libraryRootId,
        relativePath: query.relativePath
      }));
    } catch (error) {
      if (error instanceof DirectoryAlbumRootNotFoundError) {
        return reply.status(404).send({
          code: 4001,
          message: "library root not found"
        });
      }

      if (error instanceof DirectoryAlbumPathInvalidError) {
        return reply.status(400).send({
          code: 4006,
          message: "directory path invalid"
        });
      }

      throw error;
    }
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
    const page = parseBoundedInteger(query.page, { defaultValue: 1, min: 1, max: 100000 });
    const pageSize = parseBoundedInteger(query.pageSize, { defaultValue: 24, min: 1, max: 100 });
    const payload = await listAlbums(page, pageSize, {
      libraryRootId: parseOptionalString(query.libraryRootId),
      sourceType: parseEnumValue(query.sourceType, ["folder", "zip"] as const),
      keyword: parseOptionalString(query.keyword),
      sortBy: parseEnumValue(query.sortBy, ["name", "updatedAt", "assetCount"] as const),
      sortOrder: parseEnumValue(query.sortOrder, ["asc", "desc"] as const)
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
    const page = parseBoundedInteger(query.page, { defaultValue: 1, min: 1, max: 100000 });
    const pageSize = parseBoundedInteger(query.pageSize, { defaultValue: 120, min: 1, max: 300 });
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
