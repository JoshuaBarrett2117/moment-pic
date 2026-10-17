import { WorkBudget } from "../../lib/work-budget.js";
import { createLogger } from "../../lib/logger.js";
import { findAssetByIdDb, updateAssetDimensionsDb } from "../../repositories/album-repository.js";
import type { AssetRecord } from "../../types/store.js";
import { probeImageHeader, supportsHeaderProbe, type HeaderSource, type ImageDimensions } from "./image-header-probe.js";

type VersionedSource = HeaderSource & { sourceMtime: string | null; sizeBytes: string | null; width?: number | null; height?: number | null };
const logger = createLogger("HeaderDimensions");
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const MAX_NEGATIVE_ENTRIES = 10_000;

/** 生命周期内全局并发最多 4；超时取消排队和 ZIP 流，不启动剩余条目。 */
export class HeaderDimensions {
  private readonly budget = new WorkBudget(4, 32);
  private readonly inFlight = new Map<string, Promise<ImageDimensions | null>>();
  private readonly negative = new Map<string, number>();
  constructor(private readonly probe = probeImageHeader) {}

  private async one(source: VersionedSource, signal: AbortSignal): Promise<ImageDimensions | null> {
    if (source.width && source.height) return { width: source.width, height: source.height };
    if (!supportsHeaderProbe(source)) return null;
    const key = JSON.stringify([source.sourcePath, source.zipEntryPath, source.sourceMtime, source.sizeBytes]);
    const negativeUntil = this.negative.get(key);
    if (negativeUntil && negativeUntil > Date.now()) return null;
    this.negative.delete(key);
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
    let cursor = 0;
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(); }, timeoutMs);
    });
    const worker = async () => {
      while (cursor < sources.length && !controller.signal.aborted) {
        const index = cursor++;
        const result = await this.one(sources[index], controller.signal);
        if (!controller.signal.aborted) results[index] = result;
      }
    };
    try {
      await Promise.race([Promise.all(Array.from({ length: Math.min(4, sources.length) }, worker)), deadline]);
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
