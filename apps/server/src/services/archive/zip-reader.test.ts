import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { path7za } from "7zip-bin";
import yauzl from "yauzl";
import { WorkBudget } from "../../lib/work-budget.js";
import { ArchiveSafetyError } from "./archive-limits.js";
import { collectZipImageEntries, readZipStream } from "./zip-reader.js";

for (const mode of ["abort", "timeout"] as const) {
  test(`ZIP open ${mode} 立即结算调用方，延迟描述符关闭前不释放预算`, async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "zip-late-open-"));
    const archive = path.join(directory, "book.zip");
    await fs.writeFile(path.join(directory, "page.jpg"), "page");
    assert.equal(spawnSync(path7za, ["a", "-tzip", archive, "page.jpg"], { cwd: directory }).status, 0);
    const budget = new WorkBudget(1, 0);
    const controller = new AbortController();
    const original = yauzl.open;
    let deliver: (() => void) | undefined;
    let markOpened!: () => void;
    let closed = false;
    const opened = new Promise<void>((resolve) => { markOpened = resolve; });
    context.mock.method(yauzl, "open", (file: string, options: yauzl.Options, callback: (error: Error | null, zip: yauzl.ZipFile) => void) => {
      original(file, options, (error, zip) => {
        zip.once("close", () => { closed = true; });
        deliver = () => callback(error, zip);
        markOpened();
      });
    });
    const reading = collectZipImageEntries(archive, { budget, signal: controller.signal, timeoutMs: mode === "timeout" ? 80 : 1000 });
    const outcome = reading.then(() => null, (error: unknown) => error);
    try {
      await opened;
      if (mode === "abort") controller.abort();
      const error = await Promise.race([outcome, delay(250).then(() => new Error("未及时取消 ZIP open"))]);
      if (mode === "abort") assert.equal((error as Error).name, "AbortError");
      else assert.ok(error instanceof ArchiveSafetyError && error.code === "ARCHIVE_TIMEOUT");
      assert.deepEqual(budget.usage, { active: 1, queued: 0 });
      assert.equal(closed, false);
      deliver!();
      deliver = undefined;
      for (let index = 0; index < 100 && budget.usage.active; index += 1) await delay(10);
      assert.equal(closed, true);
      assert.deepEqual(budget.usage, { active: 0, queued: 0 });
    } finally {
      deliver?.();
      await outcome;
      context.mock.restoreAll();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
}

test("ZIP 列表与查找条目均遵守条目数量上限并回收句柄", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "zip-list-cap-"));
  const archive = path.join(directory, "book.zip");
  const budget = new WorkBudget(1, 1);
  try {
    await fs.writeFile(path.join(directory, "page.jpg"), "page");
    assert.equal(spawnSync(path7za, ["a", "-tzip", archive, "page.jpg"], { cwd: directory }).status, 0);
    await assert.rejects(collectZipImageEntries(archive, { budget, maxEntries: 0 }), { code: "ARCHIVE_ENTRY_LIMIT" });
    await assert.rejects(readZipStream(archive, "page.jpg", { budget, maxEntries: 0 }), { code: "ARCHIVE_ENTRY_LIMIT" });
    for (let index = 0; index < 100 && budget.usage.active; index += 1) await delay(10);
    assert.deepEqual(budget.usage, { active: 0, queued: 0 });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
