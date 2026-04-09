import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { addLibraryRoot, deleteLibraryRoot, listLibraryRoots } from "../services/album-service.js";

export const libraryRootRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/library-roots", async () => ok(await listLibraryRoots()));

  app.post("/api/v1/library-roots", async (request, reply) => {
    const body = request.body as { path: string; name?: string };
    if (!body.path) {
      return reply.status(400).send({
        code: 4003,
        message: "path is required"
      });
    }
    const name = body.name || body.path.split(/[/\\]/).pop() || "未命名";
    const result = await addLibraryRoot(body.path, name);
    return ok(result);
  });

  app.delete("/api/v1/library-roots/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = await deleteLibraryRoot(id);
    if (!success) {
      return reply.status(404).send({
        code: 4004,
        message: "library root not found"
      });
    }
    return ok({ success: true });
  });
};
