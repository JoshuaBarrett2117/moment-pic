import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { nowIso } from "../lib/time.js";
import { ScanLibraryRootNotFoundError, scanLibrary } from "../services/library-scanner.js";

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/v1/scan", async (request, reply) => {
    const body = (request.body ?? {}) as { libraryRootId?: string };
    const startedAt = nowIso();

    let result;
    try {
      result = await scanLibrary({ libraryRootId: body.libraryRootId });
    } catch (error) {
      if (error instanceof ScanLibraryRootNotFoundError) {
        return reply.status(404).send({
          code: 4004,
          message: "library root not found"
        });
      }
      throw error;
    }

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
