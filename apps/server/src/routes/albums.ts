import crypto from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { mediaRequestSignal } from "../lib/media-request.js";
import { isArchiveControlError } from "../services/archive/archive-limits.js";

import { ok } from "../lib/api.js";
import { buildShareCookie, getShareAccessToken } from "../lib/auth.js";
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
  getSharedAlbumSession,
  listManagedAlbumShares,
  listAlbums,
  recordAlbumView,
  deleteManagedAlbumShare,
  setAlbumFavorite
  , resetManagedAlbumSharePassword
} from "../services/album-service.js";
import { findAssetByIdDb, InvalidCursorError } from "../repositories/album-repository.js";
import { sendOriginal, sendVariant } from "./media-response.js";
import { DirectoryAlbumPathInvalidError, DirectoryAlbumRootNotFoundError, listDirectoryAlbums } from "../services/directory-album-service.js";
import { rescanAlbum, ScanAlbumNotFoundError, ScanAlbumSourceInvalidError, ScanLibraryRootNotFoundError } from "../services/library-scanner.js";
import {
  AssetNotFoundError,
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
    request: FastifyRequest,
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
    const asset = findAssetByIdDb(assetId);
    if (!asset) return sendSharedAssetNotFound(reply);
    const signal = mediaRequestSignal(request, reply);
    const format = (normalizeHeader(request.headers.accept) ?? "").includes("image/webp") ? "webp" as const : "jpeg" as const;
    const onError = async (error: unknown) => {
      if (error instanceof AssetNotFoundError || error instanceof OriginalAssetSourceMissingError) {
        return sendSharedAssetNotFound(reply);
      }
      throw error;
    };

    try {
      if (variant === "thumbnail") {
        return await sendVariant(request, reply, asset, { kind: "thumbnail", format }, signal, onError);
      }
      if (variant === "preview") {
        return await sendVariant(request, reply, asset, { kind: "preview", preset, format }, signal, onError);
      }
      return await sendOriginal(request, reply, asset, signal);
    } catch (error) {
      return onError(error);
    }
  };

  app.post("/api/v1/shares/:token/auth", async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = (request.body ?? {}) as { password?: string };

    try {
      const { accessToken, ...session } = await authenticateAlbumShare(token, String(body.password ?? ""), request.ip, mediaRequestSignal(request, reply));
      const maxAgeSeconds = (Date.parse(session.expiresAt) - Date.now()) / 1000;
      reply.header("set-cookie", buildShareCookie(token, accessToken, maxAgeSeconds, request.protocol === "https"));
      return ok(session);
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

  // 同一浏览器刷新分享页时，用 Cookie 恢复访问，无需重新输入密码
  app.get("/api/v1/shares/:token/session", async (request, reply) => {
    const { token } = request.params as { token: string };
    const session = getSharedAlbumSession(token, getShareAccessToken(request));
    if (!session) {
      return sendShareNotFound(reply);
    }
    return ok(session);
  });

  app.get("/api/v1/shares/:token/assets", async (request, reply) => {
    const { token } = request.params as { token: string };
    const query = request.query as { page?: string; pageSize?: string };
    const page = parseBoundedInteger(query.page, { defaultValue: 1, min: 1, max: 100000 });
    const pageSize = parseBoundedInteger(query.pageSize, { defaultValue: 120, min: 1, max: 300 });
    const payload = await getSharedAlbumAssets(token, getShareAccessToken(request), page, pageSize);

    if (!payload) {
      return sendShareNotFound(reply);
    }

    return ok(payload);
  });

  app.get("/api/v1/shares/:token/assets/:assetId/thumbnail", async (request, reply) => {
    const { token, assetId } = request.params as { token: string; assetId: string };
    return sendSharedAsset(request, token, assetId, getShareAccessToken(request), reply, "thumbnail");
  });

  app.get("/api/v1/shares/:token/assets/:assetId/original", async (request, reply) => {
    const { token, assetId } = request.params as { token: string; assetId: string };
    return sendSharedAsset(request, token, assetId, getShareAccessToken(request), reply, "original");
  });

  app.get("/api/v1/shares/:token/assets/:assetId/preview", async (request, reply) => {
    const { token, assetId } = request.params as { token: string; assetId: string };
    const query = request.query as { preset?: "low" | "balanced" | "high" };
    return sendSharedAsset(request, token, assetId, getShareAccessToken(request), reply, "preview", parseEnumValue(query.preset, ["low", "balanced", "high"] as const));
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

  app.post("/api/v1/album-shares/:shareId/password", async (request, reply) => {
    const { shareId } = request.params as { shareId: string };
    const { password } = (request.body ?? {}) as { password?: string };
    try {
      if (!(await resetManagedAlbumSharePassword(shareId, String(password ?? "")))) return sendShareNotFound(reply);
      return ok({ success: true });
    } catch (error) {
      if (error instanceof AlbumShareInputInvalidError) return reply.status(400).send({ code: 4009, message: "分享密码长度必须为 1–128 个字符" });
      throw error;
    }
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

  const sendInvalidCursor = (reply: FastifyReply) =>
    reply.status(400).send({
      code: 4012,
      message: "invalid cursor"
    });

  app.get("/api/v1/albums", async (request, reply) => {
    const query = request.query as {
      page?: string;
      cursor?: string;
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
    // cursor 优先（键集分页）；仍可只传 page（OFFSET，向后兼容）。游标请求里的 page 仅回显，供前端累积。
    const cursor = query.cursor === undefined ? undefined : String(query.cursor);
    let payload: Awaited<ReturnType<typeof listAlbums>>;
    try {
      payload = await listAlbums({ page, cursor, pageSize }, {
        libraryRootId: parseOptionalString(query.libraryRootId),
        sourceType: parseEnumValue(query.sourceType, ["folder", "zip"] as const),
        keyword: parseOptionalString(query.keyword),
        sortBy: parseEnumValue(query.sortBy, ["name", "updatedAt", "assetCount"] as const),
        sortOrder: parseEnumValue(query.sortOrder, ["asc", "desc"] as const),
        favoriteOnly: query.favoriteOnly === "true"
      });
    } catch (error) {
      if (error instanceof InvalidCursorError) return sendInvalidCursor(reply);
      throw error;
    }
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
    const query = request.query as { page?: string; cursor?: string; pageSize?: string };
    const page = parseBoundedInteger(query.page, { defaultValue: 1, min: 1, max: 100000 });
    const pageSize = parseBoundedInteger(query.pageSize, { defaultValue: 120, min: 1, max: 300 });
    const cursor = query.cursor === undefined ? undefined : String(query.cursor);
    let payload: Awaited<ReturnType<typeof getAlbumAssets>>;
    try {
      payload = await getAlbumAssets(albumId, page, pageSize, cursor);
    } catch (error) {
      if (error instanceof InvalidCursorError) return sendInvalidCursor(reply);
      throw error;
    }

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
          message: "相册扫描失败，已保留原索引，请检查媒体目录后重试"
        });
      }

      if (isArchiveControlError(error)) throw error;
      app.log.error({ err: error, albumId }, "相册重新扫描失败");
      return reply.status(500).send({ code: 5004, message: "相册扫描失败，已保留原索引，请检查媒体目录后重试" });
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
