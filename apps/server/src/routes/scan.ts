import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { nowIso } from "../lib/time.js";
import { scanLibrary } from "../services/library-scanner.js";

type ScanTaskStatus = "pending" | "running" | "completed" | "failed";

type ScanTaskRecord = {
  id: string;
  libraryRootId: string | null;
  status: ScanTaskStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: {
    albumsDiscovered: number;
    assetsDiscovered: number;
  } | null;
};

const scanTasks = new Map<string, ScanTaskRecord>();
let scanQueue: Promise<void> = Promise.resolve();

const enqueueScanTask = (taskId: string) => {
  scanQueue = scanQueue
    .then(async () => {
      const task = scanTasks.get(taskId);
      if (!task) {
        return;
      }

      task.status = "running";
      task.startedAt = nowIso();

      try {
        const result = await scanLibrary({
          libraryRootId: task.libraryRootId ?? undefined
        });
        task.status = "completed";
        task.result = {
          albumsDiscovered: result.albumsDiscovered,
          assetsDiscovered: result.assetsDiscovered
        };
        task.finishedAt = nowIso();
      } catch (error) {
        task.status = "failed";
        task.finishedAt = nowIso();
        task.error = error instanceof Error ? error.message : "scan failed";
      }
    })
    .catch(() => {
      // 队列异常兜底，避免阻断后续任务
    });
};

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/v1/scan", async (request, reply) => {
    const body = (request.body ?? {}) as { libraryRootId?: string };
    if (body.libraryRootId && typeof body.libraryRootId !== "string") {
      return reply.status(400).send({
        code: 4003,
        message: "libraryRootId must be string"
      });
    }

    const taskId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: ScanTaskRecord = {
      id: taskId,
      libraryRootId: body.libraryRootId ?? null,
      status: "pending",
      createdAt: nowIso(),
      startedAt: null,
      finishedAt: null,
      error: null,
      result: null
    };

    scanTasks.set(taskId, task);
    enqueueScanTask(taskId);

    return ok({
      taskId,
      status: task.status,
      createdAt: task.createdAt
    });
  });

  app.get("/api/v1/scan/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const task = scanTasks.get(taskId);
    if (!task) {
      return reply.status(404).send({
        code: 4004,
        message: "scan task not found"
      });
    }

    return ok({
      taskId: task.id,
      status: task.status,
      libraryRootId: task.libraryRootId,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      error: task.error,
      albumsDiscovered: task.result?.albumsDiscovered ?? 0,
      assetsDiscovered: task.result?.assetsDiscovered ?? 0
    });
  });
};
