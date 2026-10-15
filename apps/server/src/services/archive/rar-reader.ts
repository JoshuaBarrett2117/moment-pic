import { channel } from "node:diagnostics_channel";
import path from "node:path";
import { Readable } from "node:stream";
import { Worker } from "node:worker_threads";
import type { FileHeader } from "node-unrar-js";
import { isSupportedImageExtension } from "../../lib/image-formats.js";
import { normalizeExtension } from "../../lib/paths.js";
import { normalizeArchiveEntryPath } from "../archive-utils.js";
import { acquireArchiveLease, ArchiveSafetyError, collectBounded, MAX_ARCHIVE_ENTRIES, MAX_ENTRY_BYTES, MAX_LISTING_BYTES, type ArchiveOptions } from "./archive-limits.js";
import type { ArchiveImageEntry } from "./archive-types.js";
import { RAR_CHUNK_BYTES, RAR_WORKER_CHANNEL, type RarWorkerMessage, type RarWorkerRequest } from "./rar-protocol.js";

export const readRarStream = async (archivePath: string, entryPath: string | undefined, options: ArchiveOptions = {}): Promise<Readable> => {
  const lease = await acquireArchiveLease(options);
  let worker: Worker | undefined;
  let exited = false;
  let stopping = false;
  let done = false;
  let failure: Error | undefined;
  const control = new Int32Array(new SharedArrayBuffer(4 * Int32Array.BYTES_PER_ELEMENT));
  const credit = () => { Atomics.store(control, 0, 1); Atomics.notify(control, 0); };
  const output = new Readable({ highWaterMark: RAR_CHUNK_BYTES, read: credit });
  const fail = (error: Error) => {
    failure ??= error;
    output.destroy(error);
    if (worker && !exited && !stopping) {
      stopping = true;
      void worker.terminate();
    }
  };
  const abort = () => fail(lease.signal.reason instanceof Error ? lease.signal.reason : new Error("归档请求已取消"));
  output.on("error", fail);
  output.once("close", () => { if (!exited) fail(new Error("归档输出已关闭")); });
  try {
    lease.signal.throwIfAborted();
    const source = import.meta.url.endsWith(".ts");
    const workerUrl = new URL(source ? "./rar-worker.ts" : "./rar-worker.js", import.meta.url);
    const data: RarWorkerRequest = { archivePath, entryPath: entryPath === undefined ? undefined : normalizeArchiveEntryPath(entryPath),
      maxBytes: options.maxBytes ?? MAX_ENTRY_BYTES, maxEntries: options.maxEntries ?? MAX_ARCHIVE_ENTRIES,
      maxListingBytes: entryPath === undefined ? Math.min(options.maxBytes ?? MAX_LISTING_BYTES, MAX_LISTING_BYTES) : MAX_LISTING_BYTES,
      control: control.buffer as SharedArrayBuffer };
    worker = source
      ? new Worker(`import('tsx/esm/api').then(({ register }) => { register(); return import(${JSON.stringify(workerUrl.href)}); });`, { eval: true, workerData: data, execArgv: [] })
      : new Worker(workerUrl, { workerData: data, execArgv: [] });
    worker.on("message", (message: RarWorkerMessage) => {
      if (failure) return;
      if (message.type === "chunk") {
        if (output.push(Buffer.from(message.data))) credit();
      } else if (message.type === "done") done = true;
      else fail(message.code === "ARCHIVE_BYTE_LIMIT" || message.code === "ARCHIVE_ENTRY_LIMIT"
        ? new ArchiveSafetyError(message.code, message.message) : new Error(message.message));
    });
    worker.once("error", fail);
    worker.once("exit", (code) => {
      exited = true;
      lease.signal.removeEventListener("abort", abort);
      lease.release();
      if (!failure && (code !== 0 || !done)) fail(new Error(`RAR worker 退出异常（${code}）`));
      else if (!failure) output.push(null);
    });
    lease.signal.addEventListener("abort", abort, { once: true });
    channel(RAR_WORKER_CHANNEL).publish({ worker, control });
    if (lease.signal.aborted) abort();
    return output;
  } catch (error) {
    if (worker) fail(error as Error);
    else { lease.release(); output.destroy(); }
    throw error;
  }
};

export const collectRarImageEntries = async (archivePath: string, options: ArchiveOptions = {}): Promise<ArchiveImageEntry[]> => {
  const buffer = await collectBounded(await readRarStream(archivePath, undefined, options));
  const entries: ArchiveImageEntry[] = [];
  for (const line of buffer.toString("utf8").split("\n")) {
    if (!line) continue;
    const header = JSON.parse(line) as FileHeader;
    const entryPath = normalizeArchiveEntryPath(header.name);
    const extension = normalizeExtension(entryPath);
    if (header.flags.directory || header.flags.encrypted || !isSupportedImageExtension(extension)) continue;
    entries.push({ entryPath, name: path.posix.basename(entryPath), extension, sizeBytes: header.unpSize });
  }
  return entries;
};
