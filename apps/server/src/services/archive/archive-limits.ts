import { Transform, type Readable } from "node:stream";
import { ResourceBusyError, WorkBudget } from "../../lib/work-budget.js";

type ArchiveSafetyCode = "ARCHIVE_TIMEOUT" | "ARCHIVE_BYTE_LIMIT" | "ARCHIVE_ENTRY_LIMIT" | "ARCHIVE_STDERR_LIMIT";

export class ArchiveSafetyError extends Error {
  readonly statusCode: number;
  constructor(readonly code: ArchiveSafetyCode, message: string) {
    super(message);
    this.name = "ArchiveSafetyError";
    this.statusCode = code === "ARCHIVE_TIMEOUT" ? 504 : 413;
  }
}

export class ArchiveDecodeError extends Error {
  readonly code = "ARCHIVE_DECODE_ERROR";
  readonly statusCode = 422;
  constructor(message: string) { super(message); this.name = "ArchiveDecodeError"; }
}

export const isArchiveControlError = (error: unknown, signal?: AbortSignal): boolean =>
  Boolean(signal?.aborted) || error instanceof ArchiveSafetyError || error instanceof ArchiveDecodeError || error instanceof ResourceBusyError ||
  (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"));

export type ArchiveOptions = { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number; maxEntries?: number; budget?: WorkBudget };
export const archiveBudget = new WorkBudget(4, 32);
export const MAX_ENTRY_BYTES = 256 * 1024 * 1024;
export const MAX_LISTING_BYTES = 8 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 50_000;

export type ArchiveLease = { signal: AbortSignal; release: () => void };

export const acquireArchiveLease = async (options: ArchiveOptions = {}): Promise<ArchiveLease> => {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new ArchiveSafetyError("ARCHIVE_TIMEOUT", "归档处理超时")), options.timeoutMs ?? 30_000);

  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  try {
    const releaseBudget = await (options.budget ?? archiveBudget).acquire(signal);
    let released = false;
    return { signal, release: () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      releaseBudget();
    } };
  } catch (error) { clearTimeout(timer); if (signal.aborted) throw signal.reason; throw error; }
};

export const byteLimiter = (maxBytes = MAX_ENTRY_BYTES): Transform => {
  let total = 0;
  return new Transform({ highWaterMark: 64 * 1024, transform(chunk: Buffer, _encoding, callback) {
    total += chunk.length;
    callback(total > maxBytes ? new ArchiveSafetyError("ARCHIVE_BYTE_LIMIT", "归档解压字节数超过上限") : null, chunk);
  } });
};

export const collectBounded = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};
