import type { FastifyPluginAsync } from "fastify";

import { buildAuthCookie, buildClearAuthCookie, createAuthToken } from "../lib/auth.js";
import { ok } from "../lib/api.js";

const COOKIE_TTL_SECONDS = 24 * 60 * 60;
const AUTH_USERNAME = "admin";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = (request.body ?? {}) as {
      username?: string;
      password?: string;
    };

    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (username !== AUTH_USERNAME || password !== app.config.adminPassword) {
      return reply.status(401).send({
        code: 4010,
        message: "用户名或密码错误"
      });
    }

    const expiresAt = Date.now() + COOKIE_TTL_SECONDS * 1000;
    const token = createAuthToken(app.config.adminPassword, expiresAt);
    reply.header("set-cookie", buildAuthCookie(token, COOKIE_TTL_SECONDS));

    return ok({
      username: AUTH_USERNAME,
      expiresAt: new Date(expiresAt).toISOString()
    });
  });

  app.post("/api/v1/auth/logout", async (_request, reply) => {
    reply.header("set-cookie", buildClearAuthCookie());
    return ok({ success: true });
  });
};
