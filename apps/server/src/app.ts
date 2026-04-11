import Fastify from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "./config/env.js";
import { isAuthenticated } from "./lib/auth.js";
import { albumRoutes } from "./routes/albums.js";
import { authRoutes } from "./routes/auth.js";
import { assetRoutes } from "./routes/assets.js";
import { healthRoutes } from "./routes/health.js";
import { libraryRootRoutes } from "./routes/library-roots.js";
import { scanRoutes } from "./routes/scan.js";
import { wsService } from "./services/websocket-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(env.publicDir);

const publicRoutes = new Set([
  "/",
  "/index.html",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/health",
  "/favicon.ico"
]);

const getPathname = (url: string): string => {
  const queryIndex = url.indexOf("?");
  return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
};

export const buildApp = () => {
  const app = Fastify({
    logger: true
  });

  app.get("/*", async (request, reply) => {
    const pathname = getPathname(request.url);
    const filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
    
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        const indexPath = path.join(filePath, "index.html");
        const content = await fs.readFile(indexPath);
        return reply.type("text/html").send(content);
      }
      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      const contentTypes: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon"
      };
      const contentType = contentTypes[ext] || "application/octet-stream";
      return reply.type(contentType).send(content);
    } catch {
      return reply.status(404).send({ error: "Not Found" });
    }
  });

  app.decorate("config", env);
  app.decorate("readFile", fs.readFile);

  wsService.initialize(app);

  app.addHook("onRequest", async (request, reply) => {
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
  app.register(albumRoutes, { prefix: "/api/v1" });
  app.register(assetRoutes, { prefix: "/api/v1" });
  app.register(scanRoutes, { prefix: "/api/v1" });
  app.register(libraryRootRoutes, { prefix: "/api/v1" });

  return app;
};
