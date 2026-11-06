import type { FastifyRequest } from "fastify";

import { resolveSession, type ResolvedSession } from "../services/auth-service.js";

export const AUTH_COOKIE_NAME = "moment_pic_auth";

export const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) {
    return {};
  }

  if (cookieHeader.length > 8192) return {};
  try {
    const cookies = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const separatorIndex = item.indexOf("=");
      if (separatorIndex <= 0) {
        return acc;
      }

      const key = item.slice(0, separatorIndex).trim();
      const value = item.slice(separatorIndex + 1).trim();
      if (Object.hasOwn(acc, key)) throw new Error("duplicate cookie");
      acc[key] = decodeURIComponent(value);
      return acc;
    }, Object.create(null) as Record<string, string>);
    return cookies;
  } catch {
    return {};
  }
};

/** 从请求 cookie 中解析并校验服务端会话（数据库查询，已吊销/过期/禁用用户均无效）。 */
export const getSession = (request: Pick<FastifyRequest, "headers">): ResolvedSession | null =>
  resolveSession(parseCookies(request.headers.cookie)[AUTH_COOKIE_NAME]);

export const isAuthenticated = (request: Pick<FastifyRequest, "headers">): boolean => getSession(request) !== null;

export const getSessionToken = (request: Pick<FastifyRequest, "headers">): string | undefined =>
  parseCookies(request.headers.cookie)[AUTH_COOKIE_NAME];

export const buildAuthCookie = (token: string, maxAgeSeconds: number, secure = false): string => {
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
};

export const buildClearAuthCookie = (secure = false): string => {
  return `${AUTH_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
};
