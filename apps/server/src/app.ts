import Fastify from "fastify";
import fs from "node:fs/promises";

import { env } from "./config/env.js";
import { staticPlugin } from "./plugins/static.js";
import { albumRoutes } from "./routes/albums.js";
import { assetRoutes } from "./routes/assets.js";
import { healthRoutes } from "./routes/health.js";
import { libraryRootRoutes } from "./routes/library-roots.js";
import { scanRoutes } from "./routes/scan.js";

export const buildApp = () => {
  const app = Fastify({
    logger: true
  });

  app.decorate("config", env);
  app.decorate("readFile", fs.readFile);

  app.register(healthRoutes);
  app.register(libraryRootRoutes);
  app.register(scanRoutes);
  app.register(albumRoutes);
  app.register(assetRoutes);
  app.register(staticPlugin);

  app.get("/", async (_request, reply) => reply.redirect("/index.html"));

  return app;
};
