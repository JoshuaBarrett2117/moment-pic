import path from "node:path";
import type { Readable } from "node:stream";

import yauzl from "yauzl";

import { isSupportedImageExtension } from "../../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../../lib/paths.js";
import { extractJpegFromPsd } from "../archive-utils.js";
import { acquireArchiveLease, ArchiveSafetyError, byteLimiter, collectBounded, MAX_ARCHIVE_ENTRIES, MAX_ENTRY_BYTES, MAX_LISTING_BYTES, type ArchiveOptions } from "./archive-limits.js";
import type { ArchiveImageEntry } from "./archive-types.js";

type ZipEntryName = string | Buffer;

const ZIP_UTF8_FLAG = 0x800;

const decodeZipText = (buffer: Buffer, forceUtf8: boolean): string => {
  if (forceUtf8) {
    return buffer.toString("utf8");
  }

  const utf8 = buffer.toString("utf8");
  if (process.platform !== "win32") {
    return utf8;
  }

  try {
    const gbk = new TextDecoder("gbk").decode(buffer);
    const utf8ReplacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
    const gbkReplacementCount = (gbk.match(/\uFFFD/g) ?? []).length;
    if (gbkReplacementCount < utf8ReplacementCount) {
      return gbk;
    }
    if (gbkReplacementCount === utf8ReplacementCount && gbk.length >= utf8.length) {
      return gbk;
    }
  } catch {
    return utf8;
  }

  return utf8;
};

const toDecodedZipEntryPath = (entry: yauzl.Entry): string => {
  const rawName = entry.fileName as ZipEntryName;
  const nameBuffer = Buffer.isBuffer(rawName) ? rawName : Buffer.from(rawName, "utf8");
  const isUtf8 = (entry.generalPurposeBitFlag & ZIP_UTF8_FLAG) === ZIP_UTF8_FLAG;
  const decoded = decodeZipText(nameBuffer, isUtf8);
  return toPosixPath(decoded);
};

const managedZip = async (zipPath: string, options: ArchiveOptions) => {
  const lease = await acquireArchiveLease(options);
  try { lease.signal.throwIfAborted(); } catch (error) { lease.release(); throw error; }
  return new Promise<{ zip: yauzl.ZipFile; signal: AbortSignal; close: () => void }>((resolve, reject) => {
    let zip: yauzl.ZipFile | undefined;
    const abort = () => { reject(lease.signal.reason); zip?.close(); };
    lease.signal.addEventListener("abort", abort, { once: true });
    const release = () => { lease.signal.removeEventListener("abort", abort); lease.release(); };
    try {
      yauzl.open(zipPath, { lazyEntries: true, decodeStrings: false, autoClose: false }, (error, opened) => {
        if (error || !opened) { release(); reject(error ?? new Error("无法打开 ZIP")); return; }
        zip = opened;
        opened.once("close", release);
        if (lease.signal.aborted) { opened.close(); reject(lease.signal.reason); return; }
        resolve({ zip: opened, signal: lease.signal, close: () => opened.close() });
      });
    } catch (error) { release(); reject(error); }
    if (lease.signal.aborted) abort();
  });
};

export const collectZipImageEntries = async (zipPath: string, options: ArchiveOptions = {}): Promise<ArchiveImageEntry[]> => {
  const { zip, signal, close } = await managedZip(zipPath, options);
  return new Promise((resolve, reject) => {
    const entries: ArchiveImageEntry[] = [];
    let count = 0;
    let pathBytes = 0;
    const fail = (error: Error) => { signal.removeEventListener("abort", abort); close(); reject(error); };
    const abort = () => fail(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    zip.on("entry", (entry) => {
      try {
        const entryPath = toDecodedZipEntryPath(entry);
        count += 1;
        pathBytes += Buffer.byteLength(entryPath);
        if (count > (options.maxEntries ?? MAX_ARCHIVE_ENTRIES) || pathBytes > MAX_LISTING_BYTES) throw new ArchiveSafetyError("ARCHIVE_ENTRY_LIMIT", "ZIP 列表超过上限");
        const extension = normalizeExtension(entryPath);
        if (!entryPath.endsWith("/") && isSupportedImageExtension(extension)) entries.push({ entryPath, name: path.basename(entryPath), extension, sizeBytes: entry.uncompressedSize });
        zip.readEntry();
      } catch (error) { fail(error as Error); }
    });
    zip.once("error", fail);
    zip.once("end", () => { signal.removeEventListener("abort", abort); close(); resolve(entries); });
    if (signal.aborted) abort(); else zip.readEntry();
  });
};

export const readZipStream = async (zipPath: string, entryPath: string, options: ArchiveOptions = {}): Promise<Readable> => {
  const { zip, signal, close } = await managedZip(zipPath, options);
  return new Promise((resolve, reject) => {
    let found = false;
    let settled = false;
    let count = 0;
    let pathBytes = 0;
    let source: Readable | undefined;
    const output = byteLimiter(options.maxBytes);
    const fail = (error: Error) => {
      output.destroy(error);
      source?.destroy();
      close();
      if (!settled) { settled = true; reject(error); }
    };
    const abort = () => fail(signal.reason);
    output.on("error", () => { source?.destroy(); close(); });
    output.once("close", () => { signal.removeEventListener("abort", abort); source?.destroy(); close(); });
    signal.addEventListener("abort", abort, { once: true });
    zip.on("entry", (entry) => {
      if (settled) return;
      try {
        const decodedPath = toDecodedZipEntryPath(entry);
        count += 1;
        pathBytes += Buffer.byteLength(decodedPath);
        if (count > (options.maxEntries ?? MAX_ARCHIVE_ENTRIES) || pathBytes > MAX_LISTING_BYTES) throw new ArchiveSafetyError("ARCHIVE_ENTRY_LIMIT", "ZIP 列表超过上限");
        if (decodedPath !== entryPath) { zip.readEntry(); return; }
        found = true;
        if (entry.uncompressedSize > (options.maxBytes ?? MAX_ENTRY_BYTES)) { fail(new ArchiveSafetyError("ARCHIVE_BYTE_LIMIT", "归档解压字节数超过上限")); return; }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) { fail(error ?? new Error("无法读取 ZIP 条目")); return; }
          source = stream;
          if (signal.aborted || output.destroyed) { fail(signal.reason ?? new Error("请求已取消")); return; }
          stream.once("error", fail);
          settled = true;
          stream.pipe(output);
          resolve(output);
        });
      } catch (error) { fail(error as Error); }
    });
    zip.once("error", fail);
    zip.once("end", () => { if (!found) fail(new Error("ZIP entry not found")); });
    if (signal.aborted) abort(); else zip.readEntry();
  });
};

export const readZipBuffer = async (zipPath: string, entryPath: string, options: ArchiveOptions = {}): Promise<Buffer> =>
  extractJpegFromPsd(await collectBounded(await readZipStream(zipPath, entryPath, options)));

/** 只读取条目前缀；达到上限即关闭流，仍受归档并发、超时、列表及条目预算约束。 */
export const readZipHead = async (zipPath: string, entryPath: string, options: ArchiveOptions = {}): Promise<Buffer> => {
  const maxBytes = Math.min(128 * 1024, Math.max(1, options.maxBytes ?? 128 * 1024));
  const { zip, signal, close } = await managedZip(zipPath, options);
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      let source: Readable | undefined;
      let settled = false;
      let count = 0;
      let pathBytes = 0;
      let total = 0;
      const chunks: Buffer[] = [];
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        source?.destroy();
        if (error) reject(error); else resolve(Buffer.concat(chunks, total));
      };
      const abort = () => finish(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      zip.once("error", finish);
      zip.once("end", () => finish(new Error("ZIP entry not found")));
      zip.on("entry", (entry) => {
        if (settled) return;
        const name = toDecodedZipEntryPath(entry);
        count++;
        pathBytes += Buffer.byteLength(name);
        if (count > (options.maxEntries ?? MAX_ARCHIVE_ENTRIES) || pathBytes > MAX_LISTING_BYTES) {
          finish(new ArchiveSafetyError("ARCHIVE_ENTRY_LIMIT", "ZIP 头部查找超过条目上限")); return;
        }
        if (name !== entryPath) { zip.readEntry(); return; }
        if (entry.uncompressedSize > MAX_ENTRY_BYTES) { finish(new ArchiveSafetyError("ARCHIVE_BYTE_LIMIT", "ZIP 条目超过预算")); return; }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) { finish(error ?? new Error("无法读取 ZIP 条目头部")); return; }
          source = stream;
          if (settled || signal.aborted) { stream.destroy(); abort(); return; }
          stream.once("error", finish);
          stream.once("end", () => finish());
          stream.on("data", (chunk: Buffer) => {
            const head = chunk.subarray(0, maxBytes - total);
            chunks.push(head);
            total += head.length;
            if (total === maxBytes) finish();
          });
        });
      });
      if (signal.aborted) abort(); else zip.readEntry();
    });
  } finally {
    // managedZip 在描述符实际 close 后释放 lease，避免取消后的延迟 open 绕过预算。
    close();
  }
};
