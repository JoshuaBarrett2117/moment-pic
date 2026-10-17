import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("CacheMaintenance");
const TEMP_MAX_AGE_MS = 60 * 60 * 1000;
const INITIAL_DELAY_MS = 5 * 60 * 1000;
export type CacheFile = { path: string; sizeBytes: number; mtimeMs: number };
export type CacheSummary = { scanned: number; deleted: number; failed: number; freedBytes: number; remainingBytes: number };
type CacheOptions = { cacheDir: string; maxBytes: number; minAgeMs: number };

export const selectCacheEvictions = (files: CacheFile[], maxBytes: number, minAgeMs: number, now: number): { evict: CacheFile[]; freedBytes: number; remainingBytes: number } => {
  const sorted = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  let remainingBytes = files.reduce((total, file) => total + file.sizeBytes, 0);
  let freedBytes = 0;
  const evict: CacheFile[] = [];
  const remove = (file: CacheFile) => { evict.push(file); freedBytes += file.sizeBytes; remainingBytes -= file.sizeBytes; };
  for (const file of sorted) if (file.path.endsWith(".tmp") && now - file.mtimeMs > TEMP_MAX_AGE_MS) remove(file);
  for (const file of sorted) {
    if (remainingBytes <= maxBytes) break;
    if (file.path.endsWith(".tmp") || now - file.mtimeMs < minAgeMs) continue;
    remove(file);
  }
  return { evict, freedBytes, remainingBytes };
};

export const maintainCache = async (options: CacheOptions, signal?: AbortSignal): Promise<CacheSummary> => {
  const summary: CacheSummary = { scanned: 0, deleted: 0, failed: 0, freedBytes: 0, remainingBytes: 0 };
  const files: Array<CacheFile & { ino: number }> = [];
  let entries;
  try { entries = await fs.readdir(options.cacheDir, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return summary; throw error; }
  for (const entry of entries) {
    if (signal?.aborted) break;
    if (!entry.isFile()) continue;
    try {
      const filePath = path.join(options.cacheDir, entry.name);
      const stat = await fs.lstat(filePath);
      if (!stat.isFile()) continue;
      files.push({ path: filePath, sizeBytes: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino });
      summary.scanned++; summary.remainingBytes += stat.size;
    } catch { summary.failed++; }
  }
  const selected = selectCacheEvictions(files, options.maxBytes, options.minAgeMs, Date.now());
  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const candidate of selected.evict) {
    if (signal?.aborted) break;
    try {
      const stat = await fs.lstat(candidate.path);
      const original = byPath.get(candidate.path)!;
      // 生成器原子 rename 会更换 inode；不删除扫描后产生的新版本，也不跟随符号链接。
      if (!stat.isFile() || stat.ino !== original.ino || stat.mtimeMs !== original.mtimeMs || stat.size !== original.sizeBytes) continue;
      await fs.unlink(candidate.path);
      summary.deleted++; summary.freedBytes += candidate.sizeBytes; summary.remainingBytes -= candidate.sizeBytes;
    } catch { summary.failed++; }
  }
  logger.info("缩略图缓存清理完成", summary);
  return summary;
};

/** 单实例合并并发调用，定时任务结束后再安排下一轮；stop 取消并等待当前轮。 */
export class CacheMaintenance {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<CacheSummary> | null = null;
  private controller: AbortController | null = null;
  private stopped = false;
  private started = false;
  constructor(private readonly options: CacheOptions, private readonly operation = maintainCache) {}

  run(): Promise<CacheSummary> {
    if (this.running) return this.running;
    if (this.stopped) return Promise.resolve({ scanned: 0, deleted: 0, failed: 0, freedBytes: 0, remainingBytes: 0 });
    this.controller = new AbortController();
    this.running = this.operation(this.options, this.controller.signal).catch((error) => {
      logger.error("缓存清理失败，服务继续运行", error);
      return { scanned: 0, deleted: 0, failed: 1, freedBytes: 0, remainingBytes: 0 };
    }).finally(() => { this.running = null; this.controller = null; });
    return this.running;
  }

  start(intervalMs: number): void {
    if (this.started || this.stopped || intervalMs <= 0) return;
    this.started = true;
    const schedule = (delayMs: number) => {
      this.timer = setTimeout(() => {
        void this.run().finally(() => { if (!this.stopped) schedule(intervalMs); });
      }, Math.min(delayMs, 2_147_483_647));
      this.timer.unref();
    };
    schedule(INITIAL_DELAY_MS);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    this.controller?.abort();
    await this.running;
  }
}
