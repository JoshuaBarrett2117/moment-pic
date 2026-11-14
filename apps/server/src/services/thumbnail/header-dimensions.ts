import { WorkBudget } from "../../lib/work-budget.js";
import { createLogger } from "../../lib/logger.js";
import { findAssetByIdDb, updateAssetDimensionsDb } from "../../repositories/album-repository.js";
import type { AssetRecord } from "../../types/store.js";
import { probeImageHeader, probeZipImageHeaders, supportsHeaderProbe, type HeaderSource, type ImageDimensions } from "./image-header-probe.js";

type VersionedSource = HeaderSource & { sourceMtime: string | null; sizeBytes: string | null; width?: number | null; height?: number | null };
const logger = createLogger("HeaderDimensions");
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const MAX_NEGATIVE_ENTRIES = 10_000;

/** 生命周期内全局并发最多 4；超时取消排队和 ZIP 流，不启动剩余条目。 */
export class HeaderDimensions {
  private readonly budget = new WorkBudget(4, 32);
  private readonly inFlight = new Map<string, Promise<ImageDimensions | null>>();
  private readonly negative = new Map<string, number>();
  constructor(private readonly probe = probeImageHeader, private readonly batchProbe = probeZipImageHeaders) {}

  private keyOf(source: VersionedSource): string {
    return JSON.stringify([source.sourcePath, source.zipEntryPath, source.sourceMtime, source.sizeBytes]);
  }

  private isNegative(key: string): boolean {
    const negativeUntil = this.negative.get(key);
    if (negativeUntil && negativeUntil > Date.now()) return true;
    this.negative.delete(key);
    return false;
  }

  /** 同一 ZIP 的多个条目合成一个任务：只占一个并发槽，归档只打开一次，结果逐条回填。 */
  private async zipBatch(items: Array<{ index: number; source: VersionedSource }>, signal: AbortSignal, timeoutMs: number,
    onResult: (index: number, dimensions: ImageDimensions) => void): Promise<void> {
    const byEntry = new Map<string, Array<{ index: number; key: string }>>();
    for (const { index, source } of items) {
      const key = this.keyOf(source);
      if (this.isNegative(key)) continue;
      const list = byEntry.get(source.zipEntryPath!) ?? [];
      list.push({ index, key });
      byEntry.set(source.zipEntryPath!, list);
    }
    if (byEntry.size === 0) return;
    await this.budget.run(async () => {
      try {
        await this.batchProbe(items[0].source.sourcePath, [...byEntry.keys()], (entryPath, dimensions) => {
          for (const { index, key } of byEntry.get(entryPath) ?? []) {
            if (dimensions) onResult(index, dimensions);
            else if (!signal.aborted) this.rememberFailure(key);
          }
        }, signal, timeoutMs);
      } catch (error) {
        if (!signal.aborted) logger.warn("ZIP 批量头部探测失败，保留未知尺寸", { error: error instanceof Error ? error.name : "Error" });
      }
    }, signal).catch(() => undefined);
  }

  private async one(source: VersionedSource, signal: AbortSignal): Promise<ImageDimensions | null> {
    if (source.width && source.height) return { width: source.width, height: source.height };
    if (!supportsHeaderProbe(source)) return null;
    const key = this.keyOf(source);
    if (this.isNegative(key)) return null;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const task = this.budget.run(async () => {
      try {
        const dimensions = await this.probe(source, signal);
        if (!dimensions && !signal.aborted) this.rememberFailure(key);
        return dimensions;
      } catch (error) {
        if (!signal.aborted) {
          this.rememberFailure(key);
          logger.warn("图片头部探测失败，保留未知尺寸", { error: error instanceof Error ? error.name : "Error" });
        }
        return null;
      }
    }, signal).catch(() => null).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, task);
    return task;
  }

  private rememberFailure(key: string): void {
    if (this.negative.size >= MAX_NEGATIVE_ENTRIES) this.negative.delete(this.negative.keys().next().value!);
    this.negative.set(key, Date.now() + NEGATIVE_TTL_MS);
  }

  async fill(sources: VersionedSource[], timeoutMs = 3000): Promise<Array<ImageDimensions | null>> {
    const controller = new AbortController();
    const results: Array<ImageDimensions | null> = sources.map((source) => source.width && source.height ? { width: source.width, height: source.height } : null);
    // 同一 ZIP 内 ≥2 个待探测条目走批量路径；其余（目录文件、单条目 ZIP）逐个探测
    const zipGroups = new Map<string, Array<{ index: number; source: VersionedSource }>>();
    const singles: number[] = [];
    sources.forEach((source, index) => {
      if (results[index]) return;
      if (source.sourceType === "zip" && source.zipEntryPath && supportsHeaderProbe(source)) {
        const group = zipGroups.get(source.sourcePath) ?? [];
        group.push({ index, source });
        zipGroups.set(source.sourcePath, group);
      } else singles.push(index);
    });
    const batches: Array<Array<{ index: number; source: VersionedSource }>> = [];
    for (const group of zipGroups.values()) {
      if (group.length > 1) batches.push(group);
      else singles.push(group[0].index);
    }
    singles.sort((a, b) => a - b);
    let cursor = 0;
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(); }, timeoutMs);
    });
    const worker = async () => {
      while (cursor < singles.length && !controller.signal.aborted) {
        const index = singles[cursor++];
        const result = await this.one(sources[index], controller.signal);
        if (!controller.signal.aborted) results[index] = result;
      }
    };
    const batchTasks = batches.map((group) => this.zipBatch(group, controller.signal, timeoutMs, (index, dimensions) => {
      if (!controller.signal.aborted) results[index] = dimensions;
    }));
    try {
      await Promise.race([Promise.all([...Array.from({ length: Math.min(4, singles.length) }, worker), ...batchTasks]), deadline]);
      return results;
    } finally { clearTimeout(timer); controller.abort(); }
  }
}

export const headerDimensions = new HeaderDimensions();

export const fillAssetDimensions = async (assets: AssetRecord[]): Promise<AssetRecord[]> => {
  const dimensions = await headerDimensions.fill(assets);
  const updates: Parameters<typeof updateAssetDimensionsDb>[0] = [];
  const result = assets.map((asset, index) => {
    const size = dimensions[index];
    if (!size || (asset.width && asset.height)) return asset;
    const current = findAssetByIdDb(asset.id);
    // 探测期间可能发生重扫/删除，不允许旧版本结果覆盖新资产。
    if (!current || current.sourceMtime !== asset.sourceMtime || current.sizeBytes !== asset.sizeBytes) return asset;
    if (current.width && current.height) return current;
    updates.push({ assetId: asset.id, ...size });
    return { ...asset, ...size };
  });
  if (updates.length) updateAssetDimensionsDb(updates);
  return result;
};
