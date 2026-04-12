import Fastify from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";

import { env } from "./config/env.js";
import { isAuthenticated } from "./lib/auth.js";
import { albumRoutes } from "./routes/albums.js";
import { authRoutes } from "./routes/auth.js";
import { assetRoutes } from "./routes/assets.js";
import { healthRoutes } from "./routes/health.js";
import { libraryRootRoutes } from "./routes/library-roots.js";
import { scanRoutes } from "./routes/scan.js";
import { systemConfigRoutes } from "./routes/system-config.js";
import { wsService } from "./services/websocket-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(env.publicDir);

const getPathname = (url: string): string => {
  const queryIndex = url.indexOf("?");
  return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
};

const appendUtf8Charset = (contentType: string): string => {
  if (/;\s*charset=/i.test(contentType)) {
    return contentType;
  }

  const normalized = contentType.toLowerCase();
  const shouldForceUtf8 =
    normalized.startsWith("text/") ||
    normalized.startsWith("application/json") ||
    normalized.startsWith("application/javascript") ||
    normalized.startsWith("text/javascript") ||
    normalized.startsWith("application/xml") ||
    normalized.startsWith("image/svg+xml");

  return shouldForceUtf8 ? `${contentType}; charset=utf-8` : contentType;
};

export const buildApp = () => {
  const app = Fastify({
    logger: true
  });

  app.decorate("config", env);

  wsService.initialize(app);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    }

    if (request.method === "OPTIONS") {
      return reply.status(200).send();
    }

    const pathname = getPathname(request.url);

    if (pathname === "/ws") {
      return;
    }

    if (pathname.startsWith("/api/")) {
      if (pathname === "/api/v1/auth/login" || pathname === "/api/v1/auth/logout" || pathname === "/api/v1/health") {
        return;
      }
      const authed = isAuthenticated(request, app.config.adminPassword);
      if (!authed) {
        return reply.status(401).send({
          code: 4010,
          message: "unauthorized"
        });
      }
    }
  });

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(albumRoutes);
  app.register(assetRoutes);
  app.register(scanRoutes);
  app.register(libraryRootRoutes);
  app.register(systemConfigRoutes);
  app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    prefix: "/",
    index: ["index.html"],
    wildcard: false,
    setHeaders: (res, filePath) => {
      const currentTypeHeader = res.getHeader("Content-Type");
      const currentType = Array.isArray(currentTypeHeader)
        ? String(currentTypeHeader[0] ?? "")
        : String(currentTypeHeader ?? "");
      if (!currentType) {
        return;
      }

      const nextType = appendUtf8Charset(currentType);
      if (nextType !== currentType) {
        res.setHeader("Content-Type", nextType);
      }
    }
  });

  app.setNotFoundHandler(async (request, reply) => {
    const pathname = getPathname(request.url);

    if (pathname.startsWith("/api/") || pathname.startsWith("/ws")) {
      return reply.status(404).send({ error: "Not Found" });
    }

    return reply.type("text/html; charset=utf-8").sendFile("index.html");
  });

  return app;
};
