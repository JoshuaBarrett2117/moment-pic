import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { path7za } from "7zip-bin";
import { WorkBudget } from "../../lib/work-budget.js";
import { listRootImageEntries, openArchiveEntryBody, readArchiveEntryBuffer } from "../archive.js";

for (const type of ["zip", "7z"] as const) {
  test(`真实 ${type} 归档成功、字节上限、排队取消、超时与释放`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "archive-limits-"));
    const archive = path.join(directory, `book.${type}`);
    const budget = new WorkBudget(1, 2);
    try {
      await fs.writeFile(path.join(directory, "page.jpg"), Buffer.alloc(1024 * 1024, 0x5a));
      assert.equal(spawnSync(path7za, ["a", `-t${type}`, archive, "page.jpg"], { cwd: directory }).status, 0);
      assert.equal((await listRootImageEntries(archive, { budget }))[0].name, "page.jpg");
      assert.equal((await readArchiveEntryBuffer(archive, "page.jpg", { budget })).length, 1024 * 1024);
      await assert.rejects(listRootImageEntries(archive, { budget, maxEntries: 0 }), { code: "ARCHIVE_ENTRY_LIMIT" });
      await assert.rejects(readArchiveEntryBuffer(archive, "page.jpg", { budget, maxBytes: 1024 }), /字节数/);
      await delay(20);
      const release = await budget.acquire();
      const controller = new AbortController();
      const queued = readArchiveEntryBuffer(archive, "page.jpg", { budget, signal: controller.signal });
      controller.abort();
      await assert.rejects(queued, { name: "AbortError" });
      await assert.rejects(listRootImageEntries(archive, { budget, timeoutMs: 30 }), /取消|超时/);
      release();
      const abort = new AbortController();
      const body = await openArchiveEntryBody(archive, "page.jpg", { budget, signal: abort.signal });
      assert.ok(!Buffer.isBuffer(body));
      abort.abort();
      body.destroy();
      for (let index = 0; index < 100 && budget.usage.active; index += 1) await delay(10);
      assert.deepEqual(budget.usage, { active: 0, queued: 0 });
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
}
