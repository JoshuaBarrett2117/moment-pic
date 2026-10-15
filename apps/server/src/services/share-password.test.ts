import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { WorkBudget, ResourceBusyError } from "../lib/work-budget.js";
import { SharePasswordService } from "./share-password.js";

test("所有哈希/校验共享全局有界队列与并发预算，耗尽后快速拒绝并恢复", async () => {
  const budget = new WorkBudget(1, 1);
  let active = 0;
  let peak = 0;
  const passwords = new SharePasswordService(budget, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await delay(25);
    active -= 1;
    return Buffer.alloc(64);
  });
  const first = passwords.hash("first");
  const second = passwords.verify("second", "0".repeat(32) + ":" + "0".repeat(128));
  await assert.rejects(passwords.hash("third"), ResourceBusyError);
  await Promise.all([first, second]);
  assert.equal(peak, 1);
  assert.deepEqual(budget.usage, { active: 0, queued: 0 });
  assert.ok(await passwords.hash("recovered"));
});

test("取消正在运行的原生 scrypt 不提前释放预算，排队有超时且不启动派生", async (context) => {
  const crypto = await import("node:crypto");
  let callback!: (error: Error | null, derived: Buffer) => void;
  context.mock.method(crypto.default, "scrypt", (_password: string, _salt: string, _length: number, done: typeof callback) => { callback = done; });
  const budget = new WorkBudget(1, 1);
  const passwords = new SharePasswordService(budget, undefined, 30);
  const controller = new AbortController();
  const first = passwords.hash("first", controller.signal);
  await delay(0);
  controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.deepEqual(budget.usage, { active: 1, queued: 0 });
  await assert.rejects(passwords.hash("waiting"), /排队超时/);
  assert.deepEqual(budget.usage, { active: 1, queued: 0 });
  const queuedAbort = new AbortController();
  const queued = passwords.hash("cancelled-queue", queuedAbort.signal);
  queuedAbort.abort();
  await assert.rejects(queued, { name: "AbortError" });
  assert.deepEqual(budget.usage, { active: 1, queued: 0 });
  callback(null, Buffer.alloc(64));
  await delay(0);
  assert.deepEqual(budget.usage, { active: 0, queued: 0 });
});

test("scrypt 兼容既有 salt:hash 格式，异常哈希/超长密码及派生失败安全恢复", async () => {
  const passwords = new SharePasswordService();
  const hash = await passwords.hash("correct");
  assert.equal(await passwords.verify("correct", hash), true);
  assert.equal(await passwords.verify("wrong", hash), false);
  assert.equal(await passwords.verify("correct", "invalid"), false);
  await assert.rejects(passwords.hash("x".repeat(129)), { statusCode: 400 });
  const budget = new WorkBudget(1, 0);
  const failed = new SharePasswordService(budget, async () => { throw new Error("derive failed"); });
  await assert.rejects(failed.hash("test"), /derive failed/);
  assert.deepEqual(budget.usage, { active: 0, queued: 0 });
});
