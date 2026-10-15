import path from "node:path";
import type { Readable } from "node:stream";

import yauzl from "yauzl";

import { isSupportedImageExtension } from "../../lib/image-formats.js";
import { normalizeExtension, toPosixPath } from "../../lib/paths.js";
import { extractJpegFromPsd } from "../archive-utils.js";
import { acquireArchiveLease, byteLimiter, collectBounded, MAX_ARCHIVE_ENTRIES, MAX_ENTRY_BYTES, MAX_LISTING_BYTES, type ArchiveOptions } from "./archive-limits.js";
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
  try {
    const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true, decodeStrings: false, autoClose: false }, (error, opened) => {
        if (error || !opened) reject(error ?? new Error("无法打开 ZIP"));
        else resolve(opened);
      });
    });
    zip.once("close", lease.release);
    const close = () => zip.close();
    if (lease.signal.aborted) { close(); lease.signal.throwIfAborted(); }
    return { zip, signal: lease.signal, close };
  } catch (error) { lease.release(); throw error; }
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
        if (count > (options.maxEntries ?? MAX_ARCHIVE_ENTRIES) || pathBytes > MAX_LISTING_BYTES) throw new Error("ZIP 列表超过上限");
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
        if (toDecodedZipEntryPath(entry) !== entryPath) { zip.readEntry(); return; }
        found = true;
        if (entry.uncompressedSize > (options.maxBytes ?? MAX_ENTRY_BYTES)) { fail(new Error("归档解压字节数超过上限")); return; }
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
