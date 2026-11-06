import type { FastifyReply } from "fastify";

/**
 * 安全响应头。不启用 HSTS / upgrade-insecure-requests：本程序常以局域网 HTTP 访问，
 * 强制 HTTPS 会把用户锁在门外；HTTPS 场景由反向代理负责 HSTS。
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // motion / React 内联 style 属性需要 'unsafe-inline'
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  // 分享 token 位于 URL 中，禁止通过 Referer 外泄
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"
};

export const applySecurityHeaders = (reply: FastifyReply): void => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
};
