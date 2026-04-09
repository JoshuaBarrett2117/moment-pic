import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/health", async () =>
    ok({
      status: "ok"
    })
  );
};
