import type { FastifyPluginAsync } from "fastify";
import { ok } from "../lib/api.js";
import { getHealth } from "../services/health-service.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/health", async (_request, reply) => {
    const health = getHealth();
    reply.header("Cache-Control", "no-store");
    return reply.status(health.status === "ok" ? 200 : 503).send(ok(health));
  });
};
