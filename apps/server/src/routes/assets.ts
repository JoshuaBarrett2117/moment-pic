import { lookup as lookupMimeType } from "mime-types";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { mediaRequestSignal } from "../lib/media-request.js";
import { isArchiveControlError } from "../services/archive/archive-limits.js";
import { ok } from "../lib/api.js";
import { parseBoundedInteger, parseEnumValue } from "../lib/request-query.js";
import { deleteAsset, getAssetDetail } from "../services/album-service.js";
import { findAssetByIdDb } from "../repositories/album-repository.js";
import {
  AssetNotFoundError,
  openOriginalImage,
  OriginalAssetSourceMissingError
} from "../services/thumbnail-service.js";
import type { AssetRecord } from "../types/store.js";
import { sendOriginal, sendVariant } from "./media-response.js";

const normalizeHeader = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const resolvePreferredFormat = (
  requestedFormat: "webp" | "jpeg" | undefined,
  acceptHeader: string
): "webp" | "jpeg" => {
  if (requestedFormat === "webp" || requestedFormat === "jpeg") {
    return requestedFormat;
  }

  return acceptHeader.includes("image/webp") ? "webp" : "jpeg";
};

export const assetRoutes: FastifyPluginAsync = async (app) => {
  const sendAssetNotFound = (reply: FastifyReply) =>
    reply.status(404).send({
      code: 4002,
      message: "asset not found"
    });

  const sendOriginalSourceMissing = (reply: FastifyReply) =>
    reply.status(404).send({
      code: 4005,
      message: "original asset source not found"
    });

  const sendOriginalAssetFallback = async (preloaded: AssetRecord, reply: FastifyReply, signal: AbortSignal) => {
    const { asset, body, sizeBytes } = await openOriginalImage(preloaded.id, signal, preloaded);
    const mimeType = lookupMimeType(asset.name) || "application/octet-stream";
    if (sizeBytes !== null && Number.isFinite(sizeBytes)) {
      reply.header("Content-Length", String(sizeBytes));
    }
    reply.type(mimeType);
    return reply.send(body);
  };

  app.get("/api/v1/assets/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    mediaRequestSignal(request, reply);
    const asset = await getAssetDetail(assetId);

    if (!asset) {
      return sendAssetNotFound(reply);
    }

    return ok(asset);
  });

  const handleMediaError = (reply: FastifyReply, error: unknown) => {
    if (error instanceof AssetNotFoundError) return sendAssetNotFound(reply);
    if (error instanceof OriginalAssetSourceMissingError) return sendOriginalSourceMissing(reply);
    throw error;
  };

  /** 生成失败时回退为直接发送原图（不缓存）。 */
  const fallbackToOriginal = (request: Parameters<typeof sendOriginal>[0], reply: FastifyReply, assetId: string, signal: AbortSignal) =>
    async (error: unknown) => {
      if (error instanceof AssetNotFoundError) return sendAssetNotFound(reply);
      if (error instanceof OriginalAssetSourceMissingError) return sendOriginalSourceMissing(reply);
      if (isArchiveControlError(error, signal)) throw error;
      const asset = findAssetByIdDb(assetId);
      if (!asset) return sendAssetNotFound(reply);
      try {
        return await sendOriginalAssetFallback(asset, reply, signal);
      } catch (fallbackError) {
        return handleMediaError(reply, fallbackError);
      }
    };

  app.get("/api/v1/assets/:assetId/thumbnail", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const signal = mediaRequestSignal(request, reply);
    const query = request.query as { w?: string; h?: string; fit?: string; format?: "webp" | "jpeg" };
    const fit = parseEnumValue(query.fit, ["cover", "inside"] as const);
    if (query.fit !== undefined && !fit) return reply.status(400).send({ code: 4006, message: "fit must be cover or inside" });
    const width = query.w ? parseBoundedInteger(query.w, { defaultValue: 0, min: 1, max: 4096 }) : undefined;
    const height = query.h ? parseBoundedInteger(query.h, { defaultValue: 0, min: 1, max: 4096 }) : undefined;
    const format = resolvePreferredFormat(parseEnumValue(query.format, ["webp", "jpeg"] as const), normalizeHeader(request.headers.accept) ?? "");
    const asset = findAssetByIdDb(assetId);
    if (!asset) return sendAssetNotFound(reply);
    return sendVariant(request, reply, asset, { kind: "thumbnail", fit, width, height, format }, signal, fallbackToOriginal(request, reply, assetId, signal));
  });

  app.get("/api/v1/assets/:assetId/original", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const signal = mediaRequestSignal(request, reply);
    const asset = findAssetByIdDb(assetId);
    if (!asset) return sendAssetNotFound(reply);
    try {
      return await sendOriginal(request, reply, asset, signal, { inlineFilename: true });
    } catch (error) {
      return handleMediaError(reply, error);
    }
  });

  app.get("/api/v1/assets/:assetId/preview", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const signal = mediaRequestSignal(request, reply);
    const query = request.query as { preset?: "low" | "balanced" | "high"; format?: "webp" | "jpeg" };
    const format = resolvePreferredFormat(parseEnumValue(query.format, ["webp", "jpeg"] as const), normalizeHeader(request.headers.accept) ?? "");
    const asset = findAssetByIdDb(assetId);
    if (!asset) return sendAssetNotFound(reply);
    const preset = parseEnumValue(query.preset, ["low", "balanced", "high"] as const);
    return sendVariant(request, reply, asset, { kind: "preview", preset, format }, signal, fallbackToOriginal(request, reply, assetId, signal));
  });

  app.delete("/api/v1/assets/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    mediaRequestSignal(request, reply);
    const success = await deleteAsset(assetId);

    if (!success) {
      return sendAssetNotFound(reply);
    }

    return ok({ success: true });
  });
};
