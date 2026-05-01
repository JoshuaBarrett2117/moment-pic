import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { nowIso } from "../lib/time.js";
import { getCacheStore } from "../services/storage-provider.js";
import { scanLibrary } from "../services/library-scanner.js";
import { warmupCoverThumbnails } from "../services/thumbnail-service.js";
import { clearAlbumListCache, clearRecentAlbumsCache } from "../services/album-service.js";

type ScanTaskStatus = "pending" | "running" | "completed" | "failed";
type WarmupTaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

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
  progress: {
    albumsDiscovered: number;
    assetsDiscovered: number;
    scannedAlbumsInRoot: number;
    libraryRootId: string | null;
    rootIndex: number;
    totalRoots: number;
    updatedAt: string | null;
  };
  warmup: {
    status: WarmupTaskStatus;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
    result: {
      total: number;
      completed: number;
      failed: number;
    } | null;
  };
};

const SCAN_TASK_CACHE_PREFIX = "task:scan:";
const SCAN_TASK_INDEX_KEY = `${SCAN_TASK_CACHE_PREFIX}index`;
const SCAN_TASK_TTL_SECONDS = 7200;
const SCAN_TASK_INDEX_TTL_SECONDS = 7200;
const SCAN_TASK_INDEX_LIMIT = 50;

const buildScanTaskCacheKey = (taskId: string) => `${SCAN_TASK_CACHE_PREFIX}${taskId}`;

const getScanTask = async (taskId: string): Promise<ScanTaskRecord | null> =>
  await getCacheStore().get<ScanTaskRecord>(buildScanTaskCacheKey(taskId));

const saveScanTask = async (task: ScanTaskRecord): Promise<void> => {
  await getCacheStore().set(buildScanTaskCacheKey(task.id), task, SCAN_TASK_TTL_SECONDS);
};

const getScanTaskIndex = async (): Promise<string[]> =>
  (await getCacheStore().get<string[]>(SCAN_TASK_INDEX_KEY)) ?? [];

const addScanTaskToIndex = async (taskId: string): Promise<void> => {
  const existing = await getScanTaskIndex();
  const next = [taskId, ...existing.filter((current) => current !== taskId)].slice(0, SCAN_TASK_INDEX_LIMIT);
  await getCacheStore().set(SCAN_TASK_INDEX_KEY, next, SCAN_TASK_INDEX_TTL_SECONDS);
};

export const scanRoutes: FastifyPluginAsync = async (app) => {
  const runScanTask = async (taskId: string) => {
    const task = await getScanTask(taskId);
    if (!task) {
      return;
    }

    task.status = "running";
    task.startedAt = nowIso();
    await saveScanTask(task);
    const heartbeatTimer = setInterval(() => {
      if (task.status === "running") {
        task.progress.updatedAt = nowIso();
        void saveScanTask(task);
      }
    }, 1000);

    try {
      const result = await scanLibrary({
        libraryRootId: task.libraryRootId ?? undefined,
        onProgress: (progress) => {
          task.progress = {
            albumsDiscovered: progress.albumsDiscovered,
            assetsDiscovered: progress.assetsDiscovered,
            scannedAlbumsInRoot: progress.scannedAlbumsInRoot,
            libraryRootId: progress.libraryRootId,
            rootIndex: progress.rootIndex,
            totalRoots: progress.totalRoots,
            updatedAt: nowIso()
          };
          void saveScanTask(task);
        }
      });
      task.status = "completed";
      task.result = {
        albumsDiscovered: result.albumsDiscovered,
        assetsDiscovered: result.assetsDiscovered
      };
      task.progress = {
        ...task.progress,
        albumsDiscovered: result.albumsDiscovered,
        assetsDiscovered: result.assetsDiscovered,
        updatedAt: nowIso()
      };
      await clearAlbumListCache();
      await clearRecentAlbumsCache();
      task.finishedAt = nowIso();
      task.warmup.status = "running";
      task.warmup.startedAt = nowIso();
      task.warmup.finishedAt = null;
      task.warmup.error = null;
      await saveScanTask(task);

      void warmupCoverThumbnails({
        libraryRootId: task.libraryRootId ?? undefined,
        concurrency: 3
      })
        .then((warmupResult) => {
          task.warmup.status = "completed";
          task.warmup.finishedAt = nowIso();
          task.warmup.result = warmupResult;
          void saveScanTask(task);
          app.log.info(
            {
              taskId,
              libraryRootId: task.libraryRootId,
              ...warmupResult
            },
            "cover thumbnail warmup completed"
          );
        })
        .catch((error) => {
          task.warmup.status = "failed";
          task.warmup.finishedAt = nowIso();
          task.warmup.error = error instanceof Error ? error.message : String(error);
          void saveScanTask(task);
          app.log.warn(
            {
              taskId,
              libraryRootId: task.libraryRootId,
              error: error instanceof Error ? error.message : String(error)
            },
            "cover thumbnail warmup failed"
          );
        });
    } catch (error) {
      task.status = "failed";
      task.finishedAt = nowIso();
      task.error = error instanceof Error ? error.message : "scan failed";
      task.warmup.status = "skipped";
      task.warmup.startedAt = null;
      task.warmup.finishedAt = nowIso();
      task.warmup.error = "scan failed, warmup skipped";
      task.warmup.result = null;
      await saveScanTask(task);
    } finally {
      clearInterval(heartbeatTimer);
    }
  };

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
      result: null,
      progress: {
        albumsDiscovered: 0,
        assetsDiscovered: 0,
        scannedAlbumsInRoot: 0,
        libraryRootId: body.libraryRootId ?? null,
        rootIndex: 0,
        totalRoots: 0,
        updatedAt: null
      },
      warmup: {
        status: "pending",
        startedAt: null,
        finishedAt: null,
        error: null,
        result: null
      }
    };

    await saveScanTask(task);
    await addScanTaskToIndex(taskId);
    void runScanTask(taskId);

    return ok({
      taskId,
      status: task.status,
      createdAt: task.createdAt,
      warmupStatus: task.warmup.status
    });
  });

  app.get("/api/v1/scan/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const task = await getScanTask(taskId);
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
      assetsDiscovered: task.result?.assetsDiscovered ?? 0,
      progress: task.progress,
      warmupStatus: task.warmup.status,
      warmupStartedAt: task.warmup.startedAt,
      warmupFinishedAt: task.warmup.finishedAt,
      warmupError: task.warmup.error,
      warmupResult: task.warmup.result
    });
  });

  app.get("/api/v1/scan", async (_request, _reply) => {
    const taskIds = await getScanTaskIndex();
    const tasks = (await Promise.all(taskIds.map(async (taskId) => await getScanTask(taskId))))
      .filter((task): task is ScanTaskRecord => task !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, SCAN_TASK_INDEX_LIMIT);

    return ok(tasks.map(task => ({
      taskId: task.id,
      status: task.status,
      libraryRootId: task.libraryRootId,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      error: task.error,
      albumsDiscovered: task.result?.albumsDiscovered ?? 0,
      assetsDiscovered: task.result?.assetsDiscovered ?? 0,
      progress: task.progress,
      warmupStatus: task.warmup.status,
      warmupStartedAt: task.warmup.startedAt,
      warmupFinishedAt: task.warmup.finishedAt,
      warmupError: task.warmup.error,
      warmupResult: task.warmup.result
    })));
  });
};
