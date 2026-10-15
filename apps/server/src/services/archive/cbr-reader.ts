import fs from "node:fs/promises";
import type { Readable } from "node:stream";
import { extractJpegFromPsd } from "../archive-utils.js";
import { acquireArchiveLease, ArchiveDecodeError, ArchiveSafetyError, collectBounded, type ArchiveLease, type ArchiveOptions } from "./archive-limits.js";
import type { ArchiveImageEntry } from "./archive-types.js";
import { collectRarImageEntries, readRarStream } from "./rar-reader.js";
import { collect7zImageEntries, read7zStream } from "./sevenzip-reader.js";

export const detectRarVersion = async (archivePath: string): Promise<4 | 5 | null> => {
  const file = await fs.open(archivePath, "r");
  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (bytesRead >= 7 && header.subarray(0, 7).equals(Buffer.from("526172211a0700", "hex"))) return 4;
    if (bytesRead === 8 && header.equals(Buffer.from("526172211a070100", "hex"))) return 5;
    if (header.subarray(0, 6).equals(Buffer.from("526172211a07", "hex"))) throw new ArchiveDecodeError("RAR 签名损坏或版本不受支持");
    return null;
  } finally { await file.close(); }
};

const inspectCbr = async (archivePath: string, options: ArchiveOptions): Promise<{ version: 4 | 5 | null; lease: ArchiveLease }> => {
  const lease = await acquireArchiveLease(options);
  return new Promise((resolve, reject) => {
    let transferred = false;
    const abort = () => reject(lease.signal.reason);
    lease.signal.addEventListener("abort", abort, { once: true });
    void (async () => {
      try {
        lease.signal.throwIfAborted();
        const version = await detectRarVersion(archivePath);
        lease.signal.throwIfAborted();
        transferred = true;
        resolve({ version, lease });
      } catch (error) { reject(error); }
      finally {
        lease.signal.removeEventListener("abort", abort);
        if (!transferred) lease.release();
      }
    })();
  });
};

const withCbrDeadline = async <Result>(options: ArchiveOptions, operation: (controlled: ArchiveOptions) => Promise<Result>, streaming = false): Promise<Result> => {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new ArchiveSafetyError("ARCHIVE_TIMEOUT", "归档处理超时")), options.timeoutMs ?? 30_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  let stream: Readable | undefined;
  try {
    signal.throwIfAborted();
    const result = await operation({ ...options, signal });
    if (streaming) {
      stream = result as Readable;
      stream.once("close", () => clearTimeout(timer));
      if (stream.closed) clearTimeout(timer);
    }
    return result;
  } finally { if (!stream) clearTimeout(timer); }
};

export const collectCbrImageEntries = async (archivePath: string, options: ArchiveOptions = {}): Promise<ArchiveImageEntry[]> =>
  withCbrDeadline(options, async (controlled) => {
    const { version, lease } = await inspectCbr(archivePath, controlled);
    if (version) return collectRarImageEntries(archivePath, controlled, lease);
    lease.release();
    return collect7zImageEntries(archivePath, controlled);
  });

export const readCbrStream = async (archivePath: string, entryPath: string, options: ArchiveOptions = {}): Promise<Readable> =>
  withCbrDeadline(options, async (controlled) => {
    const { version, lease } = await inspectCbr(archivePath, controlled);
    if (version) return readRarStream(archivePath, entryPath, controlled, lease);
    lease.release();
    return read7zStream(archivePath, entryPath, controlled);
  }, true);

export const readCbrBuffer = async (archivePath: string, entryPath: string, options: ArchiveOptions = {}): Promise<Buffer> =>
  extractJpegFromPsd(await collectBounded(await readCbrStream(archivePath, entryPath, options)));
