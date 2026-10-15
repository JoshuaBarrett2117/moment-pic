import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { acquireArchiveLease, byteLimiter, type ArchiveOptions } from "./archive-limits.js";

export const runChildStream = async (command: string, args: string[], options: ArchiveOptions = {}): Promise<Readable> => {
  const lease = await acquireArchiveLease(options);
  try { lease.signal.throwIfAborted(); } catch (error) { lease.release(); throw error; }
  return new Promise((resolve, reject) => {
    const output = byteLimiter(options.maxBytes);
    let child: ReturnType<typeof spawn>;
    let spawned = false;
    let closed = false;
    let failure: Error | null = null;
    let stderrBytes = 0;
    const fail = (error: Error) => {
      failure ??= error;
      output.destroy(error);
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      if (!closed) child?.kill("SIGKILL");
    };
    try { child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { lease.release(); reject(error); return; }
    const abort = () => fail(lease.signal.reason instanceof Error ? lease.signal.reason : new Error("归档请求已取消"));
    output.on("error", (error) => fail(error));
    output.once("close", () => { if (!closed) fail(new Error("归档输出已关闭")); });
    lease.signal.addEventListener("abort", abort, { once: true });
    child.once("spawn", () => {
      spawned = true;
      if (lease.signal.aborted) { abort(); return; }
      child.stdout!.pipe(output, { end: false });
      resolve(output);
    });
    child.stdout!.on("error", fail);
    child.stderr!.on("error", fail);
    child.stderr!.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 64 * 1024) fail(new Error("归档错误输出超过上限"));
    });
    child.once("error", (error) => { failure ??= error; });
    child.once("close", (code) => {
      closed = true;
      lease.signal.removeEventListener("abort", abort);
      lease.release();
      if (!spawned) { output.destroy(); reject(failure ?? new Error("无法启动归档程序")); return; }
      if (failure || code !== 0) output.destroy(failure ?? new Error(`归档程序退出异常（${code}）`));
      else output.end();
    });
    if (lease.signal.aborted) abort();
  });
};
