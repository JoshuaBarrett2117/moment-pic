import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { WorkBudget } from "../../lib/work-budget.js";
import { toArchiveBody } from "./archive-body.js";
import { runChildStream } from "./child-stream.js";

test("PSD 缓冲收集同样受字节上限和请求取消约束并回收真实子进程", async () => {
  const budget = new WorkBudget(1, 1);
  await assert.rejects(toArchiveBody(runChildStream(process.execPath, ["-e", "process.stdout.write('8BPS');process.stdout.write(Buffer.alloc(65536));setInterval(()=>{},1000)"], { budget, maxBytes: 1024 })), { code: "ARCHIVE_BYTE_LIMIT" });
  const controller = new AbortController();
  const reading = toArchiveBody(runChildStream(process.execPath, ["-e", "process.stdout.write('8BPS');setInterval(()=>process.stdout.write(Buffer.alloc(64)),10)"], { budget, signal: controller.signal }));
  const rejected = assert.rejects(reading, { name: "AbortError" });
  await delay(100);
  controller.abort();
  await rejected;
  for (let index = 0; index < 100 && budget.usage.active; index += 1) await delay(10);
  assert.deepEqual(budget.usage, { active: 0, queued: 0 });
});
