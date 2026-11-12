import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { createScanTaskService } from "./scan-task-service.js";
import { ScanCoordinator } from "./scan-coordinator.js";
import type { scanLibrary } from "./library-scanner.js";

type ScanInput = NonNullable<Parameters<typeof scanLibrary>[0]>;

/** 用真实协调器包一层可控的假扫描：每次调用要等测试手动放行。 */
const createHarness = () => {
  const coordinator = new ScanCoordinator();
  const calls: Array<string | null> = [];
  const releases: Array<() => void> = [];
  const fakeScan = ((input?: ScanInput) => coordinator.runExclusive("fake", async () => {
    input?.onStart?.();
    calls.push(input?.libraryRootId ?? null);
    await new Promise<void>((resolve) => releases.push(resolve));
    return { albumsDiscovered: 1, assetsDiscovered: 2, failureCount: 0, outcome: "complete", message: null };
  })) as typeof scanLibrary;
  const service = createScanTaskService({
    scanLibrary: fakeScan,
    warmupCoverThumbnails: async () => ({ total: 0, completed: 0, failed: 0, recentTotal: 0, remainingTotal: 0 }),
    clearAlbumListCache: () => undefined,
    sendScanComplete: () => undefined
  });
  const releaseNext = async () => {
    for (let index = 0; index < 100 && releases.length === 0; index += 1) await delay(2);
    releases.shift()?.();
    await delay(5);
  };
  return { service, calls, releaseNext, coordinator };
};

test("手动扫描合并：同范围或全量扫描排队/执行中时返回已有 taskId（alreadyRunning）", async () => {
  const { service, calls, releaseNext, coordinator } = createHarness();
  const full = service.startScanTask({ libraryRootId: null });
  assert.equal(full.alreadyRunning, false);
  await delay(5);
  assert.equal(service.getScanTask(full.task.id)?.status, "running");

  // 全量扫描执行中：任意范围的请求都并入它
  const sameFull = service.startScanTask({ libraryRootId: null });
  const rootDuringFull = service.startScanTask({ libraryRootId: "root-a" });
  assert.deepEqual([sameFull.alreadyRunning, rootDuringFull.alreadyRunning], [true, true]);
  assert.equal(sameFull.task.id, full.task.id);
  assert.equal(rootDuringFull.task.id, full.task.id);

  await releaseNext();
  assert.equal(service.getScanTask(full.task.id)?.status, "completed");

  // 单图库扫描：同图库合并；其他图库新建并排队（pending）
  const rootA = service.startScanTask({ libraryRootId: "root-a" });
  assert.equal(rootA.alreadyRunning, false);
  const rootAAgain = service.startScanTask({ libraryRootId: "root-a" });
  assert.equal(rootAAgain.alreadyRunning, true);
  assert.equal(rootAAgain.task.id, rootA.task.id);
  const rootB = service.startScanTask({ libraryRootId: "root-b" });
  assert.equal(rootB.alreadyRunning, false);
  await delay(5);
  assert.equal(service.getScanTask(rootB.task.id)?.status, "pending", "排在协调器队列中的任务为 pending");
  // 排队中的 root-b 同样参与合并
  assert.equal(service.startScanTask({ libraryRootId: "root-b" }).task.id, rootB.task.id);

  await releaseNext();
  await releaseNext();
  await coordinator.drain();
  assert.equal(service.getScanTask(rootB.task.id)?.status, "completed");
  assert.deepEqual(calls, [null, "root-a", "root-b"]);
  assert.equal(service.listScanTasks().length, 3);

  // 全部完成后再次请求会新建任务
  const fresh = service.startScanTask({ libraryRootId: "root-a" });
  assert.equal(fresh.alreadyRunning, false);
  assert.notEqual(fresh.task.id, rootA.task.id);
  await releaseNext();
  await coordinator.drain();
});
