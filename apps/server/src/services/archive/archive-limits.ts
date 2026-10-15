import { Transform, type Readable } from "node:stream";
import { WorkBudget } from "../../lib/work-budget.js";

export type ArchiveOptions = { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number; maxEntries?: number; budget?: WorkBudget };
export const archiveBudget = new WorkBudget(4, 32);
export const MAX_ENTRY_BYTES = 256 * 1024 * 1024;
export const MAX_LISTING_BYTES = 8 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 50_000;

export const acquireArchiveLease = async (options: ArchiveOptions = {}) => {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error("归档处理超时")), options.timeoutMs ?? 30_000);

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
  } catch (error) { clearTimeout(timer); throw error; }
};

export const byteLimiter = (maxBytes = MAX_ENTRY_BYTES): Transform => {
  let total = 0;
  return new Transform({ highWaterMark: 64 * 1024, transform(chunk: Buffer, _encoding, callback) {
    total += chunk.length;
    callback(total > maxBytes ? new Error("归档解压字节数超过上限") : null, chunk);
  } });
};

export const collectBounded = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};
