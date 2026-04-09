import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { listLibraryRoots } from "../services/album-service.js";

export const libraryRootRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/library-roots", async () => ok(await listLibraryRoots()));
};
