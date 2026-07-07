import crypto from "node:crypto";
import fs from "node:fs";
import { lookup as lookupMimeType } from "mime-types";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { ok } from "../lib/api.js";
import { parseBoundedInteger, parseEnumValue, parseOptionalString } from "../lib/request-query.js";
import {
  AlbumShareInputInvalidError,
  AlbumShareNotFoundError,
  AlbumSharePasswordInvalidError,
  authenticateAlbumShare,
  canReadSharedAsset,
  createAlbumShare,
  deleteAlbum,
  getAlbumAssets,
  getAlbumDetail,
  getRecentAlbums,
  getSharedAlbumAssets,
  listManagedAlbumShares,
  listAlbums,
  recordAlbumView,
  deleteManagedAlbumShare,
  setAlbumFavorite
} from "../services/album-service.js";
import { DirectoryAlbumPathInvalidError, DirectoryAlbumRootNotFoundError, listDirectoryAlbums } from "../services/directory-album-service.js";
import { rescanAlbum, ScanAlbumNotFoundError, ScanAlbumSourceInvalidError, ScanLibraryRootNotFoundError } from "../services/library-scanner.js";
import {
  AssetNotFoundError,
  ensurePreview,
  ensureThumbnail,
  openOriginalImage,
  OriginalAssetSourceMissingError
} from "../services/thumbnail-service.js";

export const albumRoutes: FastifyPluginAsync = async (app) => {
  const normalizeHeader = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const sendShareNotFound = (reply: FastifyReply) =>
    reply.status(404).send({
      code: 4008,
      message: "share not found"
    });

  const sendSharedAssetNotFound = (reply: FastifyReply) =>
    reply.status(404).send({
      code: 4002,
      message: "asset not found"
    });

  const sendSharedAsset = async (
    token: string,
    assetId: string,
    accessToken: string,
    reply: FastifyReply,
    variant: "thumbnail" | "preview" | "original",
    preset?: "low" | "balanced" | "high"
  ) => {
    if (!canReadSharedAsset(token, assetId, accessToken)) {
      return sendSharedAssetNotFound(reply);
    }

    try {
      if (variant === "thumbnail") {
        const thumbnail = await ensureThumbnail(assetId, {});
        reply.type(thumbnail.mimeType);
        return reply.send(fs.createReadStream(thumbnail.filePath));
      }

      if (variant === "preview") {
        const preview = await ensurePreview(assetId, { preset });
        reply.type(preview.mimeType);
        return reply.send(fs.createReadStream(preview.filePath));
      }

      const { asset, body, sizeBytes } = await openOriginalImage(assetId);
      const mimeType = lookupMimeType(asset.name) || "application/octet-stream";
      if (sizeBytes !== null && Number.isFinite(sizeBytes)) {
        reply.header("Content-Length", String(sizeBytes));
      }
      reply.type(mimeType);
      return reply.send(body);
    } catch (error) {
      if (error instanceof AssetNotFoundError || error instanceof OriginalAssetSourceMissingError) {
        return sendSharedAssetNotFound(reply);
      }
      throw error;
    }
  };

  app.post("/api/v1/shares/:token/auth", async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = (request.body ?? {}) as { password?: string };

    try {
      return ok(await authenticateAlbumShare(token, String(body.password ?? "")));
    } catch (error) {
      if (error instanceof AlbumShareNotFoundError) {
        return sendShareNotFound(reply);
      }

      if (error instanceof AlbumSharePasswordInvalidError) {
        return reply.status(401).send({
          code: 4011,
          message: "share password invalid"
        });
      }

      throw error;
    }
  });

  app.get("/api/v1/shares/:token/assets", async (request, reply) => {
    const { token } = request.params as { token: string };
    const query = request.query as { page?: string; pageSize?: string; accessToken?: string };
    const page = parseBoundedInteger(query.page, { defaultValue: 1, min: 1, max: 100000 });
    const pageSize = parseBoundedInteger(query.pageSize, { defaultValue: 120, min: 1, max: 300 });
    const payload = await getSharedAlbumAssets(token, String(query.accessToken ?? ""), page, pageSize);

    if (!payload) {
      return sendShareNotFound(reply);
    }

    return ok(payload);
  });

  app.get("/api/v1/shares/:token/assets/:assetId/thumbnail", async (request, reply) => {
    const { token, assetId } = request.params as { token: string; assetId: string };
    const query = request.query as { accessToken?: string };
    return sendSharedAsset(token, assetId, String(query.accessToken ?? ""), reply, "thumbnail");
  });

  app.get("/api/v1/shares/:token/assets/:assetId/original", async (request, reply) => {
    const { token, assetId } = request.params as { token: string; assetId: string };
    const query = request.query as { accessToken?: string };
    return sendSharedAsset(token, assetId, String(query.accessToken ?? ""), reply, "original");
  });

  app.get("/api/v1/shares/:token/assets/:assetId/preview", async (request, reply) => {
    const { token, assetId } = request.params as { token: string; assetId: string };
    const query = request.query as { preset?: "low" | "balanced" | "high"; accessToken?: string };
    return sendSharedAsset(token, assetId, String(query.accessToken ?? ""), reply, "preview", parseEnumValue(query.preset, ["low", "balanced", "high"] as const));
  });

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

  app.get("/api/v1/album-shares", async (request) => {
    const origin = `${request.protocol}://${request.host}`;
    return ok(await listManagedAlbumShares(origin));
  });

  app.delete("/api/v1/album-shares/:shareId", async (request, reply) => {
    const { shareId } = request.params as { shareId: string };
    const success = await deleteManagedAlbumShare(shareId);
    if (!success) {
      return reply.status(404).send({
        code: 4008,
        message: "share not found"
      });
    }

    return ok({ success: true });
  });

  app.patch("/api/v1/albums/:albumId/favorite", async (request, reply) => {
    const { albumId } = request.params as { albumId: string };
    const body = (request.body ?? {}) as { isFavorite?: boolean };
    const payload = await setAlbumFavorite(albumId, Boolean(body.isFavorite));

    if (!payload) {
      return reply.status(404).send({
        code: 4001,
        message: "album not found"
      });
    }

    return ok(payload);
  });

  app.post("/api/v1/albums/:albumId/share", async (request, reply) => {
    const { albumId } = request.params as { albumId: string };
    const body = (request.body ?? {}) as { password?: string; expiresAt?: string };

    try {
      const origin = `${request.protocol}://${request.host}`;
      const payload = await createAlbumShare(albumId, {
        password: String(body.password ?? ""),
        expiresAt: String(body.expiresAt ?? ""),
        origin
      });

      if (!payload) {
        return reply.status(404).send({
          code: 4001,
          message: "album not found"
        });
      }

      return ok(payload);
    } catch (error) {
      if (error instanceof AlbumShareInputInvalidError) {
        return reply.status(400).send({
          code: 4007,
          message: "share password or expiration invalid"
        });
      }

      throw error;
    }
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
      favoriteOnly?: string;
    };
    const page = parseBoundedInteger(query.page, { defaultValue: 1, min: 1, max: 100000 });
    const pageSize = parseBoundedInteger(query.pageSize, { defaultValue: 24, min: 1, max: 100 });
    const payload = await listAlbums(page, pageSize, {
      libraryRootId: parseOptionalString(query.libraryRootId),
      sourceType: parseEnumValue(query.sourceType, ["folder", "zip"] as const),
      keyword: parseOptionalString(query.keyword),
      sortBy: parseEnumValue(query.sortBy, ["name", "updatedAt", "assetCount"] as const),
      sortOrder: parseEnumValue(query.sortOrder, ["asc", "desc"] as const),
      favoriteOnly: query.favoriteOnly === "true"
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
