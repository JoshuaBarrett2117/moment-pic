import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { scanTaskService, type ScanTaskRecord } from "../services/scan-task-service.js";

const toScanTaskDTO = (task: ScanTaskRecord) => ({
  taskId: task.id,
  status: task.status,
  libraryRootId: task.libraryRootId,
  createdAt: task.createdAt,
  startedAt: task.startedAt,
  finishedAt: task.finishedAt,
  error: task.error,
  failureCount: task.result?.failureCount ?? (task.status === "failed" ? 1 : 0),
  outcome: task.result?.outcome ?? (task.status === "failed" ? "failed" : null),
  albumsDiscovered: task.result?.albumsDiscovered ?? 0,
  assetsDiscovered: task.result?.assetsDiscovered ?? 0,
  progress: task.progress,
  warmupStatus: task.warmup.status,
  warmupStartedAt: task.warmup.startedAt,
  warmupFinishedAt: task.warmup.finishedAt,
  warmupError: task.warmup.error,
  warmupResult: task.warmup.result
});

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/v1/scan", async (request, reply) => {
    const body = (request.body ?? {}) as { libraryRootId?: unknown };
    if (body.libraryRootId !== undefined && body.libraryRootId !== null && typeof body.libraryRootId !== "string") {
      return reply.status(400).send({
        code: 4003,
        message: "libraryRootId must be string"
      });
    }

    // 同范围或全量扫描已在排队/执行时合并到已有任务，避免重复点击触发多次全量扫描
    const { task, alreadyRunning } = scanTaskService.startScanTask({
      libraryRootId: typeof body.libraryRootId === "string" && body.libraryRootId ? body.libraryRootId : null
    });

    return ok({
      taskId: task.id,
      libraryRootId: task.libraryRootId,
      status: task.status,
      createdAt: task.createdAt,
      warmupStatus: task.warmup.status,
      alreadyRunning
    });
  });

  app.get("/api/v1/scan/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const task = scanTaskService.getScanTask(taskId);
    if (!task) {
      return reply.status(404).send({
        code: 4004,
        message: "scan task not found"
      });
    }

    return ok(toScanTaskDTO(task));
  });

  app.get("/api/v1/scan", async () => ok(scanTaskService.listScanTasks(50).map(toScanTaskDTO)));
};
