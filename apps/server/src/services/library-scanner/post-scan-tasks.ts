import { rebuildSmartAlbums } from "../smart-album-service.js";

/**
 * 扫描结束后的智能相册重建：只标记为脏，防抖后合并成一次执行。
 * - 连续多次增量扫描（例如拷贝一批文件）只触发一次规则计算。
 * - 自动重建不调用 AI（runAi:false），只套用已保存的规则；AI 聚类只在手动重建时运行。
 * - 重建进行中又来了扫描，结束后再补跑一次，不并发。
 */
export const SMART_ALBUM_REBUILD_DEBOUNCE_MS = 30_000;

type Logger = { warn: (obj: unknown, msg?: string) => void };

export type SmartAlbumRebuildScheduler = {
  markDirty: () => void;
  /** 立即执行挂起的重建（测试与优雅退出用）。 */
  flush: () => Promise<void>;
  cancel: () => void;
  isPending: () => boolean;
};

export const createSmartAlbumRebuildScheduler = (options: {
  delayMs?: number;
  rebuild?: () => Promise<unknown>;
  logger?: Logger;
} = {}): SmartAlbumRebuildScheduler => {
  const delayMs = options.delayMs ?? SMART_ALBUM_REBUILD_DEBOUNCE_MS;
  const rebuild = options.rebuild ?? (() => rebuildSmartAlbums({ runAi: false }));
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> | null = null;
  let dirty = false;

  const run = async (): Promise<void> => {
    if (running) {
      await running;
      return;
    }
    if (!dirty) return;
    dirty = false;
    running = (async () => {
      try {
        await rebuild();
      } catch (error) {
        options.logger?.warn({ err: error }, "扫描后智能相册重建失败");
      } finally {
        running = null;
      }
    })();
    await running;
    // 重建期间又被标脏：按防抖再排一次。
    if (dirty) schedule();
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
    timer.unref?.();
  };

  return {
    markDirty: () => {
      dirty = true;
      if (running) return; // 结束后由 run() 补排
      schedule();
    },
    flush: async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (running) await running;
      await run();
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      dirty = false;
    },
    isPending: () => dirty || timer !== null || running !== null
  };
};

export const smartAlbumRebuildScheduler = createSmartAlbumRebuildScheduler();

export const runPostLibraryScanTasks = async (): Promise<void> => {
  smartAlbumRebuildScheduler.markDirty();
};
