import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { nowIso } from "../lib/time.js";
import {
  getSmartAlbumAiConfig,
  getSmartAlbumDetail,
  getSmartAlbumMembers,
  listSmartAlbumRules,
  listSmartAlbums,
  rebuildSmartAlbums,
  testSmartAlbumAiConnection,
  testSmartAlbumRule,
  updateSmartAlbumAiConfig
} from "../services/smart-album-service.js";
import { createSmartAlbumRule, deleteSmartAlbumRule, updateSmartAlbumRule } from "../services/smart-album-rules-service.js";

type SmartAlbumRebuildTaskStatus = "pending" | "running" | "completed" | "failed";

type SmartAlbumRebuildTaskRecord = {
  id: string;
  status: SmartAlbumRebuildTaskStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: Awaited<ReturnType<typeof rebuildSmartAlbums>> | null;
};

const smartAlbumRebuildTasks = new Map<string, SmartAlbumRebuildTaskRecord>();

export const smartAlbumRoutes: FastifyPluginAsync = async (app) => {
  const runRebuildTask = async (taskId: string) => {
    const task = smartAlbumRebuildTasks.get(taskId);
    if (!task) {
      return;
    }

    task.status = "running";
    task.startedAt = nowIso();

    try {
      task.result = await rebuildSmartAlbums();
      task.status = "completed";
      task.finishedAt = nowIso();
    } catch (error) {
      task.status = "failed";
      task.finishedAt = nowIso();
      task.error = error instanceof Error ? error.message : "smart album rebuild failed";
      app.log.error(
        {
          taskId,
          error: task.error
        },
        "smart album rebuild failed"
      );
    }
  };

  const toRebuildTaskDto = (task: SmartAlbumRebuildTaskRecord) => ({
    taskId: task.id,
    status: task.status,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    error: task.error,
    result: task.result
  });

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
    const activeTask = Array.from(smartAlbumRebuildTasks.values())
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .find((task) => task.status === "pending" || task.status === "running");

    if (activeTask) {
      return ok(toRebuildTaskDto(activeTask));
    }

    const taskId = `smart_album_rebuild_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: SmartAlbumRebuildTaskRecord = {
      id: taskId,
      status: "pending",
      createdAt: nowIso(),
      startedAt: null,
      finishedAt: null,
      error: null,
      result: null
    };
    smartAlbumRebuildTasks.set(taskId, task);
    void runRebuildTask(taskId);

    return ok(toRebuildTaskDto(task));
  });

  app.get("/api/v1/smart-albums/rebuild/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const task = smartAlbumRebuildTasks.get(taskId);
    if (!task) {
      return reply.status(404).send({ code: 4004, message: "smart album rebuild task not found" });
    }
    return ok(toRebuildTaskDto(task));
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
