import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import {
  getSmartAlbumAiConfig,
  getSmartAlbumDetail,
  getSmartAlbumMembers,
  listSmartAlbumRules,
  listSmartAlbums,
  testSmartAlbumAiConnection,
  testSmartAlbumRule,
  updateSmartAlbumAiConfig
} from "../services/smart-album-service.js";
import { getSmartAlbumRebuildTask, startSmartAlbumRebuildTask } from "../services/smart-album-rebuild-service.js";
import { createSmartAlbumRule, deleteSmartAlbumRule, updateSmartAlbumRule } from "../services/smart-album-rules-service.js";

export const smartAlbumRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/smart-albums", async (request) => {
    const query = request.query as {
      page?: string;
      pageSize?: string;
      keyword?: string;
      status?: "active" | "hidden" | "review_pending";
      sortBy?: "name" | "updatedAt" | "albumCount" | "assetCount";
      sortOrder?: "asc" | "desc";
    };
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 24)));
    return ok(await listSmartAlbums(page, pageSize, query));
  });

  app.post("/api/v1/smart-albums/rebuild", async () => {
    const task = startSmartAlbumRebuildTask({
      onTaskFailed: (failedTask) => {
        app.log.error(
          {
            taskId: failedTask.taskId,
            error: failedTask.error
          },
          "smart album rebuild failed"
        );
      }
    });
    return ok(task);
  });

  app.get("/api/v1/smart-albums/rebuild/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const task = getSmartAlbumRebuildTask(taskId);
    if (!task) {
      return reply.status(404).send({ code: 4004, message: "smart album rebuild task not found" });
    }
    return ok(task);
  });

  app.get("/api/v1/smart-albums/:smartAlbumId", async (request, reply) => {
    const { smartAlbumId } = request.params as { smartAlbumId: string };
    const payload = await getSmartAlbumDetail(smartAlbumId);
    if (!payload) {
      return reply.status(404).send({ code: 4001, message: "smart album not found" });
    }
    return ok(payload);
  });

  app.get("/api/v1/smart-albums/:smartAlbumId/albums", async (request, reply) => {
    const { smartAlbumId } = request.params as { smartAlbumId: string };
    const payload = await getSmartAlbumMembers(smartAlbumId);
    if (!payload) {
      return reply.status(404).send({ code: 4001, message: "smart album not found" });
    }
    return ok({ items: payload });
  });

  app.get("/api/v1/smart-album-rules", async () => ok({ items: await listSmartAlbumRules() }));

  app.post("/api/v1/smart-album-rules", async (request) => {
    const body = request.body as Parameters<typeof createSmartAlbumRule>[0];
    return ok(await createSmartAlbumRule(body));
  });

  app.put("/api/v1/smart-album-rules/:ruleId", async (request, reply) => {
    const { ruleId } = request.params as { ruleId: string };
    const body = request.body as Parameters<typeof updateSmartAlbumRule>[1];
    const payload = await updateSmartAlbumRule(ruleId, body);
    if (!payload) {
      return reply.status(404).send({ code: 4001, message: "smart album rule not found" });
    }
    return ok(payload);
  });

  app.delete("/api/v1/smart-album-rules/:ruleId", async (request, reply) => {
    const { ruleId } = request.params as { ruleId: string };
    const success = await deleteSmartAlbumRule(ruleId);
    if (!success) {
      return reply.status(404).send({ code: 4001, message: "smart album rule not found" });
    }
    return ok({ success: true });
  });

  app.post("/api/v1/smart-album-rules/:ruleId/test", async (request, reply) => {
    const { ruleId } = request.params as { ruleId: string };
    const payload = await testSmartAlbumRule(ruleId);
    if (!payload) {
      return reply.status(404).send({ code: 4001, message: "smart album rule not found" });
    }
    return ok(payload);
  });

  app.get("/api/v1/smart-album-ai-config", async () => ok(await getSmartAlbumAiConfig()));

  app.put("/api/v1/smart-album-ai-config", async (request) => {
    const body = request.body as Parameters<typeof updateSmartAlbumAiConfig>[0];
    return ok(await updateSmartAlbumAiConfig(body));
  });

  app.post("/api/v1/smart-album-ai-config/test", async (request) => {
    const body = request.body as Parameters<typeof testSmartAlbumAiConnection>[0];
    return ok(await testSmartAlbumAiConnection(body));
  });
};
