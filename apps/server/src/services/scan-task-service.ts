import { nowIso } from "../lib/time.js";
import { createLogger } from "../lib/logger.js";
import { scanLibrary } from "./library-scanner.js";
import { warmupCoverThumbnails } from "./thumbnail-service.js";
import { clearAlbumListCache } from "./album-service.js";
import { wsService } from "./websocket-service.js";

/**
 * 手动扫描任务（POST /api/v1/scan）的状态与生命周期。
 * - 实际扫描经 scanLibrary → 扫描协调器串行执行；
 * - 合并：同范围（同一 libraryRootId）或全量扫描已在排队/执行时，不再新建任务，直接返回已有任务（alreadyRunning）。
 */
export type ScanTaskStatus = "pending" | "running" | "completed" | "failed";
export type WarmupTaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type ScanTaskRecord = {
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
    failureCount: number;
    outcome: string;
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

type ScanTaskDependencies = {
  scanLibrary: typeof scanLibrary;
  warmupCoverThumbnails: typeof warmupCoverThumbnails;
  clearAlbumListCache: () => void;
  sendScanComplete: (event: Parameters<typeof wsService.sendScanComplete>[0]) => void;
};

const MAX_RETAINED_TASKS = 200;
const logger = createLogger("scan-task");

const isActive = (task: ScanTaskRecord) => task.status === "pending" || task.status === "running";

export const createScanTaskService = (overrides: Partial<ScanTaskDependencies> = {}) => {
  const deps: ScanTaskDependencies = {
    scanLibrary,
    warmupCoverThumbnails,
    clearAlbumListCache,
    sendScanComplete: (event) => wsService.sendScanComplete(event),
    ...overrides
  };
  const tasks = new Map<string, ScanTaskRecord>();

  const prune = () => {
    if (tasks.size <= MAX_RETAINED_TASKS) return;
    const finished = [...tasks.values()].filter((task) => !isActive(task))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const task of finished.slice(0, tasks.size - MAX_RETAINED_TASKS)) tasks.delete(task.id);
  };

  /** 已在排队/执行、且覆盖本次请求范围的任务：同一图库，或全量扫描。 */
  const findCoveringTask = (libraryRootId: string | null): ScanTaskRecord | null => {
    for (const task of tasks.values()) {
      if (!isActive(task)) continue;
      if (task.libraryRootId === null || task.libraryRootId === libraryRootId) return task;
    }
    return null;
  };

  const startWarmup = (task: ScanTaskRecord) => {
    task.warmup.status = "running";
    task.warmup.startedAt = nowIso();
    task.warmup.finishedAt = null;
    task.warmup.error = null;
    void deps.warmupCoverThumbnails({ libraryRootId: task.libraryRootId ?? undefined, concurrency: 3 })
      .then((warmupResult) => {
        task.warmup.status = "completed";
        task.warmup.finishedAt = nowIso();
        task.warmup.result = warmupResult;
        logger.info("cover thumbnail warmup completed", { taskId: task.id, libraryRootId: task.libraryRootId, ...warmupResult });
      })
      .catch((error: unknown) => {
        task.warmup.status = "failed";
        task.warmup.finishedAt = nowIso();
        task.warmup.error = "封面预热失败，请稍后重试";
        logger.warn("cover thumbnail warmup failed", {
          taskId: task.id,
          libraryRootId: task.libraryRootId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
  };

  const runScanTask = async (task: ScanTaskRecord) => {
    const heartbeatTimer = setInterval(() => {
      if (task.status === "running") task.progress.updatedAt = nowIso();
    }, 1000);

    try {
      const result = await deps.scanLibrary({
        libraryRootId: task.libraryRootId ?? undefined,
        onStart: () => {
          task.status = "running";
          task.startedAt = nowIso();
        },
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
        }
      });
      task.startedAt ??= nowIso();
      task.status = result.failureCount ? "failed" : "completed";
      task.error = result.message;
      task.result = {
        albumsDiscovered: result.albumsDiscovered,
        assetsDiscovered: result.assetsDiscovered,
        failureCount: result.failureCount,
        outcome: result.outcome
      };
      deps.sendScanComplete({ libraryRootId: task.libraryRootId ?? "", albumsDiscovered: result.albumsDiscovered, assetsDiscovered: result.assetsDiscovered, failureCount: result.failureCount, message: result.message, timestamp: nowIso() });
      task.progress = {
        ...task.progress,
        albumsDiscovered: result.albumsDiscovered,
        assetsDiscovered: result.assetsDiscovered,
        updatedAt: nowIso()
      };
      deps.clearAlbumListCache();
      task.finishedAt = nowIso();
      startWarmup(task);
    } catch {
      task.startedAt ??= nowIso();
      task.status = "failed";
      task.finishedAt = nowIso();
      task.error = "扫描失败，已保留不可判定范围的索引，请检查媒体目录后重试";
      deps.clearAlbumListCache();
      deps.sendScanComplete({ libraryRootId: task.libraryRootId ?? "", albumsDiscovered: task.progress.albumsDiscovered, assetsDiscovered: task.progress.assetsDiscovered, failureCount: 1, message: task.error, timestamp: nowIso() });
      task.warmup.status = "skipped";
      task.warmup.startedAt = null;
      task.warmup.finishedAt = nowIso();
      task.warmup.error = "scan failed, warmup skipped";
      task.warmup.result = null;
    } finally {
      clearInterval(heartbeatTimer);
    }
  };

  /** 发起手动扫描；若已有覆盖本范围的任务在排队/执行，返回它并标记 alreadyRunning。 */
  const startScanTask = (input: { libraryRootId: string | null }): { task: ScanTaskRecord; alreadyRunning: boolean } => {
    const existing = findCoveringTask(input.libraryRootId);
    if (existing) return { task: existing, alreadyRunning: true };

    const task: ScanTaskRecord = {
      id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      libraryRootId: input.libraryRootId,
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
        libraryRootId: input.libraryRootId,
        rootIndex: 0,
        totalRoots: 0,
        updatedAt: null
      },
      warmup: { status: "pending", startedAt: null, finishedAt: null, error: null, result: null }
    };
    tasks.set(task.id, task);
    prune();
    void runScanTask(task);
    return { task, alreadyRunning: false };
  };

  const getScanTask = (taskId: string): ScanTaskRecord | null => tasks.get(taskId) ?? null;

  const listScanTasks = (limit = 50): ScanTaskRecord[] =>
    [...tasks.values()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

  return { startScanTask, getScanTask, listScanTasks };
};

export type ScanTaskService = ReturnType<typeof createScanTaskService>;

export const scanTaskService = createScanTaskService();
