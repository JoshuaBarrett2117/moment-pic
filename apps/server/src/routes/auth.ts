import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { buildAuthCookie, buildClearAuthCookie, getSession, getSessionToken } from "../lib/auth.js";
import { ok } from "../lib/api.js";
import { AttemptLimiter } from "../lib/rate-limit.js";
import {
  SESSION_TTL_SECONDS, authenticate, createSession, createUser, deleteUser, listUsers, revokeSession, toPublicUser,
  updateOwnAccount, updateUser
} from "../services/auth-service.js";

const unauthorized = (reply: FastifyReply) => reply.status(401).send({ code: 4010, message: "会话已过期，请重新登录" });

const sessionOf = (request: FastifyRequest) => request.authSession ?? getSession(request);

export const authRoutes: FastifyPluginAsync = async (app) => {
  const limiter = new AttemptLimiter(10);

  app.get("/api/v1/auth/session", async (request, reply) => {
    const session = sessionOf(request);
    if (!session) return unauthorized(reply);
    return ok({ authenticated: true, user: toPublicUser(session.user), expiresAt: new Date(session.expiresAt).toISOString() });
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    if (!limiter.allow(request.ip)) return reply.status(429).send({ code: 4290, message: "登录尝试过多，请稍后重试" });
    const body = (request.body ?? {}) as { username?: unknown; password?: unknown };
    const user = await authenticate(body.username, body.password);
    if (!user) {
      return reply.status(401).send({ code: 4010, message: "用户名或密码错误" });
    }

    const { token, expiresAt } = createSession(user.id, request.headers["user-agent"]);
    reply.header("set-cookie", buildAuthCookie(token, SESSION_TTL_SECONDS, request.protocol === "https"));
    return ok({ username: user.username, role: user.role, user: toPublicUser(user), expiresAt: new Date(expiresAt).toISOString() });
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    // 服务端吊销会话：即使 cookie 被复制到别处也立即失效
    revokeSession(getSessionToken(request));
    reply.header("set-cookie", buildClearAuthCookie(request.protocol === "https"));
    return ok({ success: true });
  });

  /* 当前账号：修改自己的用户名 / 密码 */
  app.get("/api/v1/account", async (request, reply) => {
    const session = sessionOf(request);
    if (!session) return unauthorized(reply);
    return ok(toPublicUser(session.user));
  });

  app.patch("/api/v1/account", async (request, reply) => {
    const session = sessionOf(request);
    if (!session) return unauthorized(reply);
    const body = (request.body ?? {}) as { currentPassword?: unknown; username?: unknown; newPassword?: unknown };
    return ok(await updateOwnAccount(session, body));
  });

  /* 用户管理（仅管理员；角色校验在 app.ts 全局钩子中统一完成） */
  app.get("/api/v1/users", async () => ok({ items: listUsers() }));

  app.post("/api/v1/users", async (request) => {
    const body = (request.body ?? {}) as { username?: unknown; password?: unknown; role?: unknown };
    return ok(await createUser(body));
  });

  app.patch<{ Params: { userId: string } }>("/api/v1/users/:userId", async (request, reply) => {
    const session = sessionOf(request);
    if (!session) return unauthorized(reply);
    const body = (request.body ?? {}) as { username?: unknown; password?: unknown; role?: unknown; disabled?: unknown };
    return ok(await updateUser(session.user, request.params.userId, body));
  });

  app.delete<{ Params: { userId: string } }>("/api/v1/users/:userId", async (request, reply) => {
    const session = sessionOf(request);
    if (!session) return unauthorized(reply);
    deleteUser(session.user, request.params.userId);
    return ok({ success: true });
  });
};
