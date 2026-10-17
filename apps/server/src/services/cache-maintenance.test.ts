import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CacheMaintenance, maintainCache, selectCacheEvictions } from "./cache-maintenance.js";

const now = 100_000_000;
const files = [{ path: "old.jpg", sizeBytes: 100, mtimeMs: now - 10000 }, { path: "new.jpg", sizeBytes: 100, mtimeMs: now - 100 }];
test("缓存未超限不删普通文件", () => assert.deepEqual(selectCacheEvictions(files, 200, 0, now), { evict: [], freedBytes: 0, remainingBytes: 200 }));
test("超限按 mtime 最旧优先，同时间按路径稳定排序且不修改输入", () => {
  const input = [...files, { path: "a.jpg", sizeBytes: 100, mtimeMs: files[0].mtimeMs }];
  assert.deepEqual(selectCacheEvictions(input, 100, 0, now).evict.map((file) => file.path), ["a.jpg", "old.jpg"]);
  assert.equal(input[0].path, "old.jpg");
});
test("minAge 内不删，即使仍超限", () => assert.equal(selectCacheEvictions(files, 0, 1000, now).remainingBytes, 100));
test("过期 tmp 优先清理，未超限也回收残留，年轻 tmp 不删", () => {
  const input = [...files, { path: "stale.tmp", sizeBytes: 100, mtimeMs: now - 3600_001 }, { path: "active.tmp", sizeBytes: 50, mtimeMs: now - 100 }];
  assert.deepEqual(selectCacheEvictions(input, 1000, 0, now).evict.map((file) => file.path), ["stale.tmp"]);
  assert.deepEqual(selectCacheEvictions(input, 100, 0, now).evict.map((file) => file.path), ["stale.tmp", "old.jpg", "new.jpg"]);
});

test("真实临时缓存 GC 降到上限并保留新文件、子目录和符号链接目标", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cache-gc-"));
  try {
    for (const [name, age] of [["old.jpg", 10000], ["middle.jpg", 5000], ["latest.jpg", 0], ["leftover.tmp", 3600_001]] as const) {
      const file = path.join(directory, name); await fs.writeFile(file, Buffer.alloc(100));
      const time = new Date(Date.now() - age); await fs.utimes(file, time, time);
    }
    await fs.mkdir(path.join(directory, "nested")); await fs.writeFile(path.join(directory, "nested", "keep"), "keep");
    await fs.symlink(path.join(directory, "nested", "keep"), path.join(directory, "link"));
    const summary = await maintainCache({ cacheDir: directory, maxBytes: 100, minAgeMs: 1000 });
    assert.deepEqual(summary, { scanned: 4, deleted: 3, failed: 0, freedBytes: 300, remainingBytes: 100 });
    assert.equal((await fs.stat(path.join(directory, "latest.jpg"))).size, 100);
    assert.equal(await fs.readFile(path.join(directory, "link"), "utf8"), "keep");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("GC 单文件删除失败继续处理其他文件", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cache-gc-fail-"));
  try {
    for (const name of ["a.jpg", "b.jpg"]) await fs.writeFile(path.join(directory, name), "123");
    const unlink = fs.unlink.bind(fs);
    context.mock.method(fs, "unlink", async (file: Parameters<typeof fs.unlink>[0]) => { if (String(file).endsWith("a.jpg")) throw new Error("unwritable"); return unlink(file); });
    const summary = await maintainCache({ cacheDir: directory, maxBytes: 0, minAgeMs: 0 });
    assert.equal(summary.failed, 1); assert.equal(summary.deleted, 1); assert.equal(summary.remainingBytes, 3);
  } finally { context.mock.restoreAll(); await fs.rm(directory, { recursive: true, force: true }); }
});

test("GC 并发合并，关闭取消正在执行的轮次且不重启", async () => {
  let calls = 0; let cancelled = false;
  const service = new CacheMaintenance({ cacheDir: "unused", maxBytes: 0, minAgeMs: 0 }, async (_options, signal) => {
    calls++;
    await new Promise<void>((resolve) => signal?.addEventListener("abort", () => { cancelled = true; resolve(); }, { once: true }));
    return { scanned: 0, deleted: 0, failed: 0, freedBytes: 0, remainingBytes: 0 };
  });
  const first = service.run(); assert.equal(service.run(), first); assert.equal(calls, 1);
  await service.stop(); await first; assert.equal(cancelled, true);
  await service.run(); assert.equal(calls, 1);
});

test("GC 启动延迟 5 分钟、失败后继续调度、0 关闭及 stop 清理定时器", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const operation = async () => { calls++; throw new Error("test failure"); };
  const options = { cacheDir: "unused", maxBytes: 0, minAgeMs: 0 };
  const disabled = new CacheMaintenance(options, operation); disabled.start(0);
  const service = new CacheMaintenance(options, operation); service.start(1000); service.start(1000);
  context.mock.timers.tick(299999); assert.equal(calls, 0);
  context.mock.timers.tick(1); await service.run(); await Promise.resolve(); assert.equal(calls, 1);
  context.mock.timers.tick(1000); await service.run(); assert.equal(calls, 2);
  await service.stop(); await disabled.stop(); context.mock.timers.tick(500000); assert.equal(calls, 2);
});
