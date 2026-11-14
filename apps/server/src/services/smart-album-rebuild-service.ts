import { nowIso } from "../lib/time.js";
import { rebuildSmartAlbums } from "./smart-album-service.js";

export type SmartAlbumRebuildTaskStatus = "pending" | "running" | "completed" | "failed";

type SmartAlbumRebuildTaskRecord = {
  id: string;
  status: SmartAlbumRebuildTaskStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: Awaited<ReturnType<typeof rebuildSmartAlbums>> | null;
};

export type SmartAlbumRebuildTaskDto = {
  taskId: string;
  status: SmartAlbumRebuildTaskStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: Awaited<ReturnType<typeof rebuildSmartAlbums>> | null;
};

const smartAlbumRebuildTasks = new Map<string, SmartAlbumRebuildTaskRecord>();
/** 只保留最近若干个已结束任务供查询；进行中的任务永不淘汰。 */
export const MAX_FINISHED_REBUILD_TASKS = 20;

const pruneFinishedTasks = () => {
  const finished = [...smartAlbumRebuildTasks.values()].filter((task) => task.status === "completed" || task.status === "failed");
  // Map 按插入顺序迭代，先插入的即较早的任务
  for (const task of finished.slice(0, Math.max(0, finished.length - MAX_FINISHED_REBUILD_TASKS))) smartAlbumRebuildTasks.delete(task.id);
};

export const getSmartAlbumRebuildTaskCount = () => smartAlbumRebuildTasks.size;

const toRebuildTaskDto = (task: SmartAlbumRebuildTaskRecord): SmartAlbumRebuildTaskDto => ({
  taskId: task.id,
  status: task.status,
  createdAt: task.createdAt,
  startedAt: task.startedAt,
  finishedAt: task.finishedAt,
  error: task.error,
  result: task.result
});

const findActiveTask = (): SmartAlbumRebuildTaskRecord | null =>
  Array.from(smartAlbumRebuildTasks.values())
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .find((task) => task.status === "pending" || task.status === "running") ?? null;

const runRebuildTask = async (
  taskId: string,
  onTaskFailed?: (task: SmartAlbumRebuildTaskDto) => void
) => {
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
    onTaskFailed?.(toRebuildTaskDto(task));
  }
};

export const startSmartAlbumRebuildTask = (options?: {
  onTaskFailed?: (task: SmartAlbumRebuildTaskDto) => void;
}): SmartAlbumRebuildTaskDto => {
  const activeTask = findActiveTask();
  if (activeTask) {
    return toRebuildTaskDto(activeTask);
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
  pruneFinishedTasks();
  smartAlbumRebuildTasks.set(taskId, task);
  void runRebuildTask(taskId, options?.onTaskFailed);

  return toRebuildTaskDto(task);
};

export const getSmartAlbumRebuildTask = (taskId: string): SmartAlbumRebuildTaskDto | null => {
  const task = smartAlbumRebuildTasks.get(taskId);
  return task ? toRebuildTaskDto(task) : null;
};
