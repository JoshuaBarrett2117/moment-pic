import type { FastifyPluginAsync } from "fastify";

import { buildAuthCookie, buildClearAuthCookie, createAuthToken, isAuthenticated } from "../lib/auth.js";
import { ok } from "../lib/api.js";
import { AttemptLimiter } from "../lib/rate-limit.js";
import { MAX_PASSWORD_LENGTH } from "../config/security.js";

const COOKIE_TTL_SECONDS = 24 * 60 * 60;
const AUTH_USERNAME = "admin";

export const authRoutes: FastifyPluginAsync = async (app) => {
  const limiter = new AttemptLimiter(10);
  app.get("/api/v1/auth/session", async (request, reply) => {
    if (!isAuthenticated(request, app.config.adminPassword)) return reply.status(401).send({ code: 4010, message: "会话已过期，请重新登录" });
    return ok({ authenticated: true });
  });
  app.post("/api/v1/auth/login", async (request, reply) => {
    if (!limiter.allow(request.ip)) return reply.status(429).send({ code: 4290, message: "登录尝试过多，请稍后重试" });
    const body = (request.body ?? {}) as {
      username?: string;
      password?: string;
    };

    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (password.length > MAX_PASSWORD_LENGTH || username !== AUTH_USERNAME || password !== app.config.adminPassword) {
      return reply.status(401).send({
        code: 4010,
        message: "用户名或密码错误"
      });
    }

    const expiresAt = Date.now() + COOKIE_TTL_SECONDS * 1000;
    const token = createAuthToken(app.config.adminPassword, expiresAt);
    reply.header("set-cookie", buildAuthCookie(token, COOKIE_TTL_SECONDS, request.protocol === "https"));

    return ok({
      username: AUTH_USERNAME,
      expiresAt: new Date(expiresAt).toISOString()
    });
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    reply.header("set-cookie", buildClearAuthCookie(request.protocol === "https"));
    return ok({ success: true });
  });
};
