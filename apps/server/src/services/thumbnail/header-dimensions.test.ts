import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { HeaderDimensions } from "./header-dimensions.js";

const source = (id: number) => ({ sourceType: "folder" as const, sourcePath: `/isolated/${id}`, zipEntryPath: null, sourceMtime: "1", sizeBytes: "1" });

test("分页探测跨请求并发最多 4，同资产 in-flight 合并", async () => {
  let active = 0; let peak = 0; let calls = 0;
  const service = new HeaderDimensions(async () => {
    active++; peak = Math.max(peak, active); calls++;
    await delay(10); active--;
    return { width: 10, height: 20 };
  });
  const assets = Array.from({ length: 12 }, (_, i) => source(i));
  const [a, b] = await Promise.all([service.fill(assets), service.fill(assets)]);
  assert.equal(peak, 4); assert.equal(calls, 12); assert.deepEqual(a, b); assert.equal(a.filter(Boolean).length, 12);
});

test("分页整体期限取消正在读取的头部，停止剩余项并返回已有结果", async () => {
  let started = 0; let cancelled = 0;
  const service = new HeaderDimensions(async (input, signal) => {
    started++;
    if (input.sourcePath.endsWith("/0")) return { width: 10, height: 20 };
    await new Promise<void>((_resolve, reject) => signal?.addEventListener("abort", () => { cancelled++; reject(signal.reason); }, { once: true }));
    return null;
  });
  const startedAt = Date.now();
  const result = await service.fill(Array.from({ length: 100 }, (_, i) => source(i)), 50);
  assert.ok(Date.now() - startedAt < 500);
  assert.deepEqual(result[0], { width: 10, height: 20 });
  assert.equal(started, 5); assert.equal(cancelled, 4);
});

test("失败负缓存按版本生效，已知尺寸与 RAR/7z 不探测", async () => {
  let calls = 0;
  const service = new HeaderDimensions(async () => { calls++; throw new Error("bad header"); });
  assert.deepEqual(await service.fill([source(1)]), [null]);
  await service.fill([source(1)]); assert.equal(calls, 1);
  await service.fill([{ ...source(1), sourceMtime: "2" }]); assert.equal(calls, 2);
  await service.fill([{ ...source(3), width: 10, height: 20 }, { ...source(4), sourceType: "zip", sourcePath: "book.cbr" }, { ...source(5), sourceType: "zip", sourcePath: "book.7z" }]);
  assert.equal(calls, 2);
});
