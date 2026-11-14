import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import zlib from "node:zlib";

import { createLogger } from "../../lib/logger.js";
import { isSupportedImageExtension } from "../../lib/image-formats.js";
import { normalizeExtension } from "../../lib/paths.js";
import { normalizeArchiveEntryPath } from "../archive-utils.js";
import { ArchiveSafetyError, collectBounded, MAX_ARCHIVE_ENTRIES, MAX_ENTRY_BYTES, MAX_LISTING_BYTES } from "./archive-limits.js";

/**
 * 7z / RAR 整包解压缓存。
 *
 * 固实压缩包按条目读取时，每取一个条目都要从头解压前面的全部内容，整本生成缩略图接近 O(n²)。
 * 这里在首次访问时把整包「顺序解压一次」：解压程序只向标准输出写入所有文件内容（按归档顺序拼接），
 * 由本模块按列表里的大小切分、逐个校验 CRC 后写到缓存目录。
 *
 * 安全性：解压程序从不写文件系统（没有路径穿越、符号链接问题）；缓存文件名由本模块按序号生成，
 * 条目路径只作为清单里的查找键。总大小、单包大小、条目数、超时均有上限；超限或校验失败就回退到逐条读取。
 */

const logger = createLogger("ArchiveExtractCache");
const MANIFEST = "manifest.json";
const FAILURE_TTL_MS = 10 * 60 * 1000;
const MAX_FAILURE_ENTRIES = 1000;

export type ExtractPlanEntry = {
  entryPath: string;
  size: number;
  /** CRC32；未知（如空文件）时为 null */
  crc: number | null;
};

/** 解压后端：给出按输出顺序排列的文件列表，以及「所有文件内容按该顺序拼接」的流。 */
export type ArchiveExtractor = {
  plan: (archivePath: string, signal: AbortSignal) => Promise<ExtractPlanEntry[]>;
  stream: (archivePath: string, maxBytes: number, signal: AbortSignal) => Promise<Readable>;
};

type Manifest = { version: 1; archivePath: string; bytes: number; files: Record<string, string> };
type CacheEntry = { key: string; dir: string; bytes: number; files: Map<string, string> };

export type ArchiveExtractCacheOptions = {
  dir: string;
  /** 缓存总上限（字节）；0 关闭 */
  maxBytes: number;
  /** 单个归档允许整包解压的上限（字节），默认总上限的 1/4 */
  perArchiveMaxBytes?: number;
  /** 后台整包解压的总时限 */
  extractTimeoutMs?: number;
};

export class ArchiveExtractCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<CacheEntry | null>>();
  private readonly failures = new Map<string, number>();
  private totalBytes = 0;
  private loading: Promise<void> | null = null;
  private readonly perArchiveMaxBytes: number;
  private readonly extractTimeoutMs: number;

  constructor(private readonly options: ArchiveExtractCacheOptions, private readonly resolveExtractor: (archivePath: string) => Promise<ArchiveExtractor | null>) {
    this.perArchiveMaxBytes = Math.min(options.perArchiveMaxBytes ?? Math.floor(options.maxBytes / 4), options.maxBytes);
    this.extractTimeoutMs = options.extractTimeoutMs ?? 10 * 60 * 1000;
  }

  get enabled(): boolean {
    return this.options.maxBytes > 0 && this.perArchiveMaxBytes > 0;
  }

  get usedBytes(): number {
    return this.totalBytes;
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * 返回条目在缓存中的文件路径；归档不可缓存、解压失败、等待超时（waitMs）时返回 null，调用方回退逐条读取。
   * 等待超时不会取消后台解压，之后的请求直接命中。
   */
  async resolve(archivePath: string, entryPath: string, options: { signal?: AbortSignal; waitMs?: number } = {}): Promise<string | null> {
    if (!this.enabled) return null;
    options.signal?.throwIfAborted();
    let stats: fs.Stats;
    try { stats = await fs.promises.stat(archivePath); } catch { return null; }
    if (!stats.isFile()) return null;
    const key = crypto.createHash("sha256").update(`${path.resolve(archivePath)}\0${stats.mtimeMs}\0${stats.size}`).digest("hex").slice(0, 32);
    const until = this.failures.get(key);
    if (until && until > Date.now()) return null;
    if (until) this.failures.delete(key);
    await this.load();

    let entry: CacheEntry | null | undefined = this.entries.get(key);
    if (!entry) {
      let task = this.inFlight.get(key);
      if (!task) {
        task = this.extract(key, archivePath).catch((error: unknown) => {
          this.rememberFailure(key);
          logger.warn("整包解压失败，回退逐条读取", { error: error instanceof Error ? error.message : String(error) });
          return null;
        }).finally(() => this.inFlight.delete(key));
        this.inFlight.set(key, task);
      }
      entry = await waitFor(task, options.waitMs ?? 30_000, options.signal);
      if (!entry) return null;
    }
    // LRU：命中后移到队尾
    this.entries.delete(key);
    this.entries.set(key, entry);
    const file = entry.files.get(normalizeArchiveEntryPath(entryPath));
    return file ? path.join(entry.dir, file) : null;
  }

  /** 等待所有后台解压结束（测试与优雅退出用）。 */
  async idle(): Promise<void> {
    await Promise.allSettled([...this.inFlight.values()]);
  }

  private rememberFailure(key: string) {
    if (this.failures.size >= MAX_FAILURE_ENTRIES) this.failures.delete(this.failures.keys().next().value!);
    this.failures.set(key, Date.now() + FAILURE_TTL_MS);
  }

  /** 启动后首次使用时加载已有缓存（按清单修改时间排 LRU），清理残留的临时目录与损坏目录。 */
  private load(): Promise<void> {
    this.loading ??= (async () => {
      await fs.promises.mkdir(this.options.dir, { recursive: true, mode: 0o700 });
      const found: Array<CacheEntry & { mtimeMs: number }> = [];
      for (const dirent of await fs.promises.readdir(this.options.dir, { withFileTypes: true })) {
        const dir = path.join(this.options.dir, dirent.name);
        if (!dirent.isDirectory() || !/^[0-9a-f]{32}$/.test(dirent.name)) {
          await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
          continue;
        }
        try {
          const manifestPath = path.join(dir, MANIFEST);
          const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8")) as Manifest;
          if (manifest.version !== 1 || typeof manifest.bytes !== "number") throw new Error("清单版本不符");
          const { mtimeMs } = await fs.promises.stat(manifestPath);
          found.push({ key: dirent.name, dir, bytes: manifest.bytes, files: new Map(Object.entries(manifest.files)), mtimeMs });
        } catch {
          await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
      }
      found.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const { mtimeMs: _mtime, ...entry } of found) {
        this.entries.set(entry.key, entry);
        this.totalBytes += entry.bytes;
      }
      await this.evict(0);
    })().catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  private async evict(incomingBytes: number): Promise<void> {
    for (const [key, entry] of this.entries) {
      if (this.totalBytes + incomingBytes <= this.options.maxBytes) break;
      this.entries.delete(key);
      this.totalBytes -= entry.bytes;
      // 正在读取的文件描述符不受删除影响（POSIX 语义）
      await fs.promises.rm(entry.dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async extract(key: string, archivePath: string): Promise<CacheEntry | null> {
    const extractor = await this.resolveExtractor(archivePath);
    if (!extractor) return null;
    const signal = AbortSignal.timeout(this.extractTimeoutMs);
    const plan = await extractor.plan(archivePath, signal);
    if (plan.length > MAX_ARCHIVE_ENTRIES) throw new ArchiveSafetyError("ARCHIVE_ENTRY_LIMIT", "归档条目数超过上限");
    const totalBytes = plan.reduce((sum, item) => sum + item.size, 0);
    if (totalBytes > this.perArchiveMaxBytes || plan.some((item) => item.size > MAX_ENTRY_BYTES)) {
      this.rememberFailure(key);
      logger.info("归档超过整包解压上限，继续逐条读取", { totalBytes, limit: this.perArchiveMaxBytes });
      return null;
    }

    const temporary = path.join(this.options.dir, `${key}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`);
    await fs.promises.mkdir(temporary, { recursive: true, mode: 0o700 });
    try {
      const keptBytes = plan.filter((item) => isSupportedImageExtension(normalizeExtension(item.entryPath))).reduce((sum, item) => sum + item.size, 0);
      await this.evict(keptBytes);
      const files = await splitConcatenated(await extractor.stream(archivePath, totalBytes, signal), plan, temporary, signal);
      const manifest: Manifest = { version: 1, archivePath, bytes: keptBytes, files: Object.fromEntries(files) };
      await fs.promises.writeFile(path.join(temporary, MANIFEST), JSON.stringify(manifest), { mode: 0o600 });
      const dir = path.join(this.options.dir, key);
      await fs.promises.rm(dir, { recursive: true, force: true });
      await fs.promises.rename(temporary, dir);
      // 解压期间可能有其他归档入缓存，提交后再按总上限收敛一次
      const entry: CacheEntry = { key, dir, bytes: keptBytes, files };
      this.entries.set(key, entry);
      this.totalBytes += keptBytes;
      await this.evict(0);
      return this.entries.get(key) ?? null;
    } catch (error) {
      await fs.promises.rm(temporary, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }
}

const waitFor = <T>(task: Promise<T>, waitMs: number, signal?: AbortSignal): Promise<T | null> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); resolve(null); }, waitMs);
    const onAbort = () => { cleanup(); reject(signal!.reason); };
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); };
    signal?.addEventListener("abort", onAbort, { once: true });
    task.then((value) => { cleanup(); resolve(value); }, (error: unknown) => { cleanup(); reject(error); });
  });

/**
 * 按计划切分拼接流：只落盘图片条目（文件名为序号），其余条目读过即丢；
 * 每个条目校验 CRC32，总字节数必须与计划严格一致，否则整体作废。
 */
export const splitConcatenated = async (stream: Readable, plan: ExtractPlanEntry[], outDir: string, signal?: AbortSignal): Promise<Map<string, string>> => {
  const files = new Map<string, string>();
  let index = 0;
  let remaining = plan[0]?.size ?? 0;
  let crc = 0;
  let handle: fs.promises.FileHandle | null = null;
  let written = 0;

  const keep = (item: ExtractPlanEntry) => isSupportedImageExtension(normalizeExtension(item.entryPath)) && !files.has(item.entryPath);
  const openCurrent = async () => {
    const item = plan[index];
    if (item && keep(item)) handle = await fs.promises.open(path.join(outDir, String(written).padStart(6, "0")), "wx", 0o600);
  };
  const finishCurrent = async () => {
    const item = plan[index];
    if (item.crc !== null && item.size > 0 && crc !== item.crc) throw new Error(`条目 CRC 校验失败：${item.entryPath}`);
    if (handle) {
      await handle.close();
      handle = null;
      files.set(item.entryPath, String(written).padStart(6, "0"));
      written++;
    }
    index++;
    crc = 0;
    remaining = plan[index]?.size ?? 0;
  };

  try {
    // 计划开头的空文件
    await openCurrent();
    while (index < plan.length && remaining === 0) { await finishCurrent(); await openCurrent(); }
    for await (const raw of stream) {
      signal?.throwIfAborted();
      let chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
      while (chunk.length > 0) {
        if (index >= plan.length) throw new Error("解压输出多于归档列表");
        const part = chunk.subarray(0, remaining);
        chunk = chunk.subarray(part.length);
        crc = zlib.crc32(part, crc);
        if (handle) await (handle as fs.promises.FileHandle).write(part);
        remaining -= part.length;
        while (index < plan.length && remaining === 0) { await finishCurrent(); await openCurrent(); }
      }
    }
    if (index < plan.length) throw new Error("解压输出少于归档列表");
    return files;
  } catch (error) {
    stream.destroy();
    throw error;
  } finally {
    if (handle) await (handle as fs.promises.FileHandle).close().catch(() => undefined);
  }
};

/** 解析 `7z l -slt -ba` 输出为切分计划（只含文件，顺序即 `x -so` 输出顺序）；含加密条目时返回 null。 */
export const parse7zPlan = (listing: string): ExtractPlanEntry[] | null => {
  const plan: ExtractPlanEntry[] = [];
  for (const block of listing.split(/\r?\n\r?\n+/).map((item) => item.trim()).filter(Boolean)) {
    const fields = new Map<string, string>();
    for (const line of block.split(/\r?\n/)) {
      const separator = line.indexOf(" = ");
      if (separator > 0) fields.set(line.slice(0, separator).trim(), line.slice(separator + 3).trim());
    }
    const entryPath = normalizeArchiveEntryPath(fields.get("Path") ?? "");
    if (!entryPath) continue;
    if (fields.get("Folder") === "+" || fields.get("Attributes")?.startsWith("D")) continue;
    if (fields.get("Encrypted") === "+") return null;
    const size = Number.parseInt(fields.get("Size") ?? "", 10);
    if (!Number.isSafeInteger(size) || size < 0) return null;
    const crcText = fields.get("CRC") ?? "";
    plan.push({ entryPath, size, crc: /^[0-9A-Fa-f]{1,8}$/.test(crcText) ? Number.parseInt(crcText, 16) >>> 0 : null });
  }
  return plan;
};

/** 默认解压后端：7z（含非 RAR 的 cbr）走 7z 程序；RAR4/5 走 node-unrar-js worker。 */
export const createDefaultExtractorResolver = () => async (archivePath: string): Promise<ArchiveExtractor | null> => {
  const { detectArchiveType } = await import("../archive-utils.js");
  const type = detectArchiveType(archivePath);
  if (type !== "7z" && type !== "cbr") return null;
  const { detectRarVersion } = await import("./cbr-reader.js");
  if (type === "cbr" && await detectRarVersion(archivePath)) {
    const { readRarStream, RAR_ALL_ENTRIES } = await import("./rar-reader.js");
    return {
      plan: async (file, signal) => {
        const listing = await collectBounded(await readRarStream(file, undefined, { signal, timeoutMs: 120_000 }));
        const plan: ExtractPlanEntry[] = [];
        for (const line of listing.toString("utf8").split("\n")) {
          if (!line) continue;
          const header = JSON.parse(line) as { name: string; unpSize: number; crc?: number; flags: { directory: boolean; encrypted: boolean } };
          if (header.flags.directory) continue;
          if (header.flags.encrypted) throw new Error("不支持加密 RAR 条目");
          plan.push({ entryPath: normalizeArchiveEntryPath(header.name), size: header.unpSize, crc: typeof header.crc === "number" && header.crc !== 0 ? header.crc >>> 0 : null });
        }
        return plan;
      },
      stream: (file, maxBytes, signal) => readRarStream(file, RAR_ALL_ENTRIES, { signal, maxBytes, timeoutMs: 24 * 60 * 60 * 1000 })
    };
  }
  const { run7zaStream } = await import("./sevenzip-reader.js");
  return {
    plan: async (file, signal) => {
      const listing = await collectBounded(await run7zaStream(["l", "-slt", "-ba", file], { signal, maxBytes: MAX_LISTING_BYTES, timeoutMs: 120_000 }));
      const plan = parse7zPlan(listing.toString("utf8"));
      if (!plan) throw new Error("归档含加密条目，不做整包解压");
      return plan;
    },
    // -so：所有文件内容按归档顺序写到标准输出，7z 不写任何磁盘文件
    stream: (file, maxBytes, signal) => run7zaStream(["x", "-so", "-bd", "-y", file], { signal, maxBytes, timeoutMs: 24 * 60 * 60 * 1000 })
  };
};
