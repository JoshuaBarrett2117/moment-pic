import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { WorkBudget, ResourceBusyError } from "../../lib/work-budget.js";
import { collectBounded } from "./archive-limits.js";
import { runChildStream } from "./child-stream.js";

const waitReleased = async (budget: WorkBudget) => {
  for (let index = 0; index < 100 && budget.usage.active; index += 1) await delay(10);
  assert.deepEqual(budget.usage, { active: 0, queued: 0 });
};
const producer = `const data=Buffer.alloc(65536,65);function pump(){while(process.stdout.write(data)){}process.stdout.once('drain',pump)}pump();`;

test("stdout end 不等于进程 close，真实子进程退出前持续占用并发槽位", async () => {
  const budget = new WorkBudget(1, 0);
  const stream = await runChildStream(process.execPath, ["-e", "process.stdout.end('head');setTimeout(()=>{},250)"], { budget });
  const reading = collectBounded(stream);
  await delay(100);
  assert.deepEqual(budget.usage, { active: 1, queued: 0 });
  await assert.rejects(runChildStream(process.execPath, ["-e", ""], { budget }), ResourceBusyError);
  assert.equal((await reading).toString(), "head");
  await waitReleased(budget);
});

test("真实子进程正常完成、spawn 失败与非零退出均释放预算", async () => {
  const budget = new WorkBudget(1, 1);
  assert.equal((await collectBounded(await runChildStream(process.execPath, ["-e", "process.stdout.write('success')"], { budget }))).toString(), "success");
  await assert.rejects(runChildStream("/nonexistent/momentpic-program", [], { budget }), { code: "ENOENT" });
  await assert.rejects(async () => collectBounded(await runChildStream(process.execPath, ["-e", "process.exit(7)"], { budget })), /退出异常/);
  await waitReleased(budget);
});

test("慢消费者触发管道背压，销毁输出会杀死并回收生产进程", async () => {
  const budget = new WorkBudget(1, 0);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "archive-child-"));
  const pidFile = path.join(directory, "pid");
  try {
    const stream = await runChildStream(process.execPath, ["-e", `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));${producer}`], { budget, timeoutMs: 2000 });
    await delay(100);
    assert.ok(stream.readableLength <= 128 * 1024);
    assert.ok((stream as import("node:stream").Transform).writableLength <= 128 * 1024);
    const pid = Number(await fs.readFile(pidFile, "utf8"));
    stream.destroy();
    await waitReleased(budget);
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("墙钟超时、取消、解压与 stderr 上限都终止提取并释放预算", async () => {
  const budget = new WorkBudget(1, 1);
  await assert.rejects(async () => collectBounded(await runChildStream(process.execPath, ["-e", "setInterval(()=>{},1000)"], { budget, timeoutMs: 60 })), /超时/);
  const controller = new AbortController();
  const running = await runChildStream(process.execPath, ["-e", "setInterval(()=>{},1000)"], { budget, signal: controller.signal });
  const reading = collectBounded(running);
  controller.abort(new Error("request disconnected"));
  await assert.rejects(reading, /disconnected/);
  await assert.rejects(async () => collectBounded(await runChildStream(process.execPath, ["-e", producer], { budget, maxBytes: 1024 })), /字节数/);
  await assert.rejects(async () => collectBounded(await runChildStream(process.execPath, ["-e", "process.stderr.write(Buffer.alloc(131072));setInterval(()=>{},1000)"], { budget })), /错误输出/);
  await waitReleased(budget);
});

test("有界队列耗尽及排队取消不启动进程，预算交接无超卖", async () => {
  const budget = new WorkBudget(1, 1);
  const first = await runChildStream(process.execPath, ["-e", "setInterval(()=>{},1000)"], { budget });
  const controller = new AbortController();
  const queued = runChildStream(process.execPath, ["-e", "process.exit(0)"], { budget, signal: controller.signal });
  await assert.rejects(runChildStream(process.execPath, [], { budget }), ResourceBusyError);
  controller.abort();
  await assert.rejects(queued, { name: "AbortError" });
  assert.deepEqual(budget.usage, { active: 1, queued: 0 });
  first.destroy();
  await waitReleased(budget);
  assert.equal((await collectBounded(await runChildStream(process.execPath, ["-e", "process.stdout.write('recovered')"], { budget }))).toString(), "recovered");
});
