import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";

/**
 * 当前请求来自内网还是外网（按 request.ip，受 TRUSTED_PROXIES 影响）。
 * 需要登录；clientIp 只返回给已登录用户，便于在设置页核对判定是否正确。
 */
export const networkRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/network", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return ok({ network: app.config.lanClassifier.classify(request.ip), clientIp: request.ip });
  });
};
