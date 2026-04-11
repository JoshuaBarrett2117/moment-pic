import Fastify from "fastify";
import fs from "node:fs/promises";

import { env } from "./config/env.js";
import { isAuthenticated } from "./lib/auth.js";
import { staticPlugin } from "./plugins/static.js";
import { albumRoutes } from "./routes/albums.js";
import { authRoutes } from "./routes/auth.js";
import { assetRoutes } from "./routes/assets.js";
import { healthRoutes } from "./routes/health.js";
import { libraryRootRoutes } from "./routes/library-roots.js";
import { scanRoutes } from "./routes/scan.js";

const publicRoutes = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/health",
  "/favicon.ico",
  "/login.html",
  "/login.js",
  "/styles.css"
]);

const getPathname = (url: string): string => {
  const queryIndex = url.indexOf("?");
  return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
};

export const buildApp = () => {
  const app = Fastify({
    logger: true
  });

  app.decorate("config", env);
  app.decorate("readFile", fs.readFile);

  app.addHook("onRequest", async (request, reply) => {
    const pathname = getPathname(request.url);
    const authed = isAuthenticated(request, app.config.adminPassword);

    if (pathname === "/login.html" && authed) {
      return reply.redirect("/index.html");
    }

    if (publicRoutes.has(pathname) || authed) {
      return;
    }

    if (pathname.startsWith("/api/")) {
      return reply.status(401).send({
        code: 4010,
        message: "unauthorized"
      });
    }

    return reply.redirect("/login.html");
  });

  app.register(authRoutes);
  app.register(healthRoutes);
  app.register(libraryRootRoutes);
  app.register(scanRoutes);
  app.register(albumRoutes);
  app.register(assetRoutes);
  app.register(staticPlugin);

  app.get("/", async (_request, reply) => reply.redirect("/index.html"));

  return app;
};
