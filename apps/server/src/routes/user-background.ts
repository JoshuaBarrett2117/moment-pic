import { createReadStream } from "node:fs";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { getSession } from "../lib/auth.js";
import { ok } from "../lib/api.js";
import {
  BACKGROUND_ACCEPTED_TYPES, BACKGROUND_MAX_UPLOAD_BYTES, BackgroundInputError, getUserBackground, removeUserBackground, saveUserBackground
} from "../services/user-background-service.js";

const BACKGROUND_PATH = "/api/v1/account/background";

const userIdOf = (request: FastifyRequest): string => {
  const session = request.authSession ?? getSession(request);
  if (!session) throw Object.assign(new Error("unauthorized"), { statusCode: 401 });
  return session.user.id;
};

const toPublic = (info: { version: string; width: number; height: number; bytes: number; updatedAt: string }) => ({
  url: `${BACKGROUND_PATH}?v=${info.version}`,
  version: info.version,
  width: info.width,
  height: info.height,
  bytes: info.bytes,
  updatedAt: info.updatedAt
});

/** 当前账号的自定义背景图（每个账号一张，只读账号也可以设置自己的）。 */
export const userBackgroundRoutes: FastifyPluginAsync = async (app) => {
  // 只在本插件内接受原始图片请求体
  app.addContentTypeParser([...BACKGROUND_ACCEPTED_TYPES], { parseAs: "buffer", bodyLimit: BACKGROUND_MAX_UPLOAD_BYTES }, (_request, body, done) => {
    done(null, body);
  });

  app.get(`${BACKGROUND_PATH}/meta`, async (request) => {
    const info = await getUserBackground(userIdOf(request));
    return ok(info ? toPublic(info) : null);
  });

  app.get<{ Querystring: { v?: string } }>(BACKGROUND_PATH, async (request, reply) => {
    const info = await getUserBackground(userIdOf(request));
    if (!info) return reply.status(404).send({ code: 4040, message: "未设置自定义背景" });
    const etag = `"bg-${info.version}"`;
    reply.header("ETag", etag);
    // 带版本号的地址内容不会变，可以长期缓存；只缓存在本浏览器
    reply.header("Cache-Control", request.query.v === info.version ? "private, max-age=31536000, immutable" : "private, no-cache");
    if (request.headers["if-none-match"] === etag) return reply.status(304).send();
    reply.type("image/webp");
    reply.header("Content-Length", String(info.bytes));
    return reply.send(createReadStream(info.filePath));
  });

  app.put(BACKGROUND_PATH, async (request, reply) => {
    const body = request.body;
    if (!Buffer.isBuffer(body)) {
      return reply.status(415).send({ code: 4150, message: "请直接上传 JPG、PNG、WebP 或 AVIF 图片" });
    }
    try {
      return ok(toPublic(await saveUserBackground(userIdOf(request), body)));
    } catch (error) {
      if (error instanceof BackgroundInputError) return reply.status(400).send({ code: 4000, message: error.message });
      throw error;
    }
  });

  app.delete(BACKGROUND_PATH, async (request) => ok({ removed: await removeUserBackground(userIdOf(request)) }));
};
