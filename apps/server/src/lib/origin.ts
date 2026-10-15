import type { IncomingMessage } from "node:http";

export const isAllowedOrigin = (request: Pick<IncomingMessage, "headers" | "socket">, allowed: string[]): boolean => {
  const origin = request.headers.origin;
  if (!origin || origin === "null") return false;
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) return false;
    const encrypted = "encrypted" in request.socket && request.socket.encrypted;
    return allowed.includes(origin) || origin === `${encrypted ? "https" : "http"}://${request.headers.host}`;
  } catch { return false; }
};
