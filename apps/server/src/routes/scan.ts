import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { nowIso } from "../lib/time.js";
import { scanLibrary } from "../services/library-scanner.js";

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/v1/scan", async () => {
    const startedAt = nowIso();
    const result = await scanLibrary();
    return ok({
      taskId: `scan_${Date.now()}`,
      status: "completed" as const,
      albumsDiscovered: result.albumsDiscovered,
      assetsDiscovered: result.assetsDiscovered,
      startedAt,
      finishedAt: nowIso()
    });
  });
};
