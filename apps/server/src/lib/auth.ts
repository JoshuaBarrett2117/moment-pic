import crypto from "node:crypto";

import type { FastifyRequest } from "fastify";

export const AUTH_COOKIE_NAME = "moment_pic_auth";
const AUTH_USERNAME = "admin";

const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
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
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
};

const sign = (payload: string, secret: string): string => {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
};

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const createAuthToken = (password: string, expiresAtMs: number): string => {
  const payload = Buffer.from(
    JSON.stringify({
      username: AUTH_USERNAME,
      exp: expiresAtMs
    }),
    "utf8"
  ).toString("base64url");
  const signature = sign(payload, password);
  return `${payload}.${signature}`;
};

export const verifyAuthToken = (token: string, password: string, nowMs = Date.now()): boolean => {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = sign(payload, password);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      username?: string;
      exp?: number;
    };
    return decoded.username === AUTH_USERNAME && typeof decoded.exp === "number" && decoded.exp > nowMs;
  } catch {
    return false;
  }
};

export const isAuthenticated = (request: FastifyRequest, password: string): boolean => {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  if (!token) {
    return false;
  }

  return verifyAuthToken(token, password);
};

export const buildAuthCookie = (token: string, maxAgeSeconds: number): string => {
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax`;
};

export const buildClearAuthCookie = (): string => {
  return `${AUTH_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
};
