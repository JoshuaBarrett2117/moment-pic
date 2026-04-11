import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
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

  app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    prefix: "/",
    redirect: false,
    trailingSlash: false,
    lastExtensions: true
  });

  app.setNotFoundHandler(async (request, reply) => {
    const pathname = getPathname(request.url);
    
    if (pathname.startsWith("/api/") || pathname.startsWith("/assets/") || pathname === "/ws") {
      return reply.status(404).send({ error: "Not Found" });
    }
    
    const indexPath = path.join(PUBLIC_DIR, "index.html");
    try {
      const content = await fs.readFile(indexPath);
      reply.type("text/html").send(content);
    } catch {
      reply.status(404).send({ error: "Not Found" });
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

    const authed = isAuthenticated(request, app.config.adminPassword);

    if (publicRoutes.has(pathname) || authed) {
      return;
    }

    if (pathname.startsWith("/api/")) {
      return reply.status(401).send({
        code: 4010,
        message: "unauthorized"
      });
    }

    return reply.redirect("/");
  });

  app.register(authRoutes);
  app.register(healthRoutes);
  app.register(libraryRootRoutes);
  app.register(scanRoutes);
  app.register(albumRoutes);
  app.register(assetRoutes);

  return app;
};
