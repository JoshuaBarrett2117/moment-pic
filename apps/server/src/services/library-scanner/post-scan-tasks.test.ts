import assert from "node:assert/strict";
import test from "node:test";

import { createSmartAlbumRebuildScheduler } from "./post-scan-tasks.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("post-scan smart album rebuild is debounced into a single run", async () => {
  let runs = 0;
  const scheduler = createSmartAlbumRebuildScheduler({ delayMs: 30, rebuild: async () => { runs += 1; } });
  scheduler.markDirty();
  scheduler.markDirty();
  scheduler.markDirty();
  assert.equal(runs, 0);
  await sleep(80);
  assert.equal(runs, 1);
  assert.equal(scheduler.isPending(), false);
});

test("marking dirty during a rebuild schedules exactly one follow-up run", async () => {
  let runs = 0;
  let release: (() => void) | null = null;
  const scheduler = createSmartAlbumRebuildScheduler({
    delayMs: 10,
    rebuild: async () => {
      runs += 1;
      if (runs === 1) await new Promise<void>((resolve) => { release = resolve; });
    }
  });
  scheduler.markDirty();
  await sleep(30);
  assert.equal(runs, 1);
  scheduler.markDirty();
  scheduler.markDirty();
  (release as (() => void) | null)?.();
  await sleep(60);
  assert.equal(runs, 2);
});

test("flush runs a pending rebuild immediately and a failure does not throw", async () => {
  let runs = 0;
  const scheduler = createSmartAlbumRebuildScheduler({
    delayMs: 60_000,
    rebuild: async () => { runs += 1; throw new Error("boom"); }
  });
  scheduler.markDirty();
  await scheduler.flush();
  assert.equal(runs, 1);
  await scheduler.flush();
  assert.equal(runs, 1, "flush without dirty state does nothing");
});
