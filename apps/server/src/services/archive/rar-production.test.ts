import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("编译后的生产 JS worker 仅用 Node 与生产依赖解码真实 RAR4/RAR5，无 tsx/unrar/7zz", async () => {
  await fs.mkdir("tmp", { recursive: true });
  const directory = await fs.mkdtemp(path.resolve("tmp/rar-production-"));
  try {
    const compiler = createRequire(import.meta.url).resolve("typescript/bin/tsc");
    const compiled = spawnSync(process.execPath, [compiler, "-p", "apps/server/tsconfig.json", "--outDir", directory], { encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    const api = pathToFileURL(path.join(directory, "services/archive.js")).href;
    const fixtureDirectory = path.resolve("apps/server/src/services/archive/fixtures");
    const workerPath = path.join(directory, "services/archive/rar-worker.js");
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs/promises';
      import { WorkBudget } from ${JSON.stringify(pathToFileURL(path.join(directory, "lib/work-budget.js")).href)};
      import { listRootImageEntries, readArchiveEntryBuffer, openArchiveEntryBody } from ${JSON.stringify(api)};
      import { createStoredRarArchive, createStoredRar5Archive } from ${JSON.stringify(pathToFileURL(path.join(directory, "services/archive/rar-test-fixture.js")).href)};
      const directory = ${JSON.stringify(fixtureDirectory)};
      const png = await fs.readFile(directory + '/pixel.png');
      for (const version of [4, 5]) {
        const archive = directory + '/pixel-rar' + version + '.cbr';
        assert.equal((await listRootImageEntries(archive))[0].entryPath, 'pixel.png');
        assert.deepEqual(await readArchiveEntryBuffer(archive, 'pixel.png'), png);
        const body = await openArchiveEntryBody(archive, 'pixel.png');
        const chunks = [];
        if (Buffer.isBuffer(body)) chunks.push(body);
        else for await (const chunk of body) chunks.push(chunk);
        assert.deepEqual(Buffer.concat(chunks), png);
        console.log('production JS RAR' + version + ': PNG exact match; PATH empty; no TS loader');
        const mixed = ${JSON.stringify(path.join(directory, "attachments.cbr"))};
        const createArchive = version === 4 ? createStoredRarArchive : createStoredRar5Archive;
        await fs.writeFile(mixed, createArchive([
          { entryPath: 'attachment.bin', content: Buffer.alloc(2048, 65) },
          { entryPath: 'pixel.png', content: png }
        ]));
        const budget = new WorkBudget(1, 0);
        assert.deepEqual(await readArchiveEntryBuffer(mixed, 'pixel.png', { budget, maxBytes: 1024 }), png);
        assert.deepEqual(budget.usage, { active: 0, queued: 0 });
        console.log('production JS RAR' + version + ': unrelated 2048-byte attachment skipped; 1024-byte budget; permit recovered');
      }
      const encrypted = ${JSON.stringify(path.join(directory, "encrypted.cbr"))};
      await fs.writeFile(encrypted, createStoredRarArchive([
        { entryPath: 'secret.bin', content: Buffer.alloc(2048, 65), encrypted: true },
        { entryPath: 'pixel.png', content: png }
      ]));
      assert.deepEqual(await readArchiveEntryBuffer(encrypted, 'pixel.png', { maxBytes: 1024 }), png);
      await assert.rejects(readArchiveEntryBuffer(encrypted, 'secret.bin'), { code: 'ARCHIVE_DECODE_ERROR' });
      console.log('production JS RAR4: unrelated AES-encrypted attachment skipped; encrypted target rejected');
      const workerPath = ${JSON.stringify(workerPath)};
      const original = await fs.readFile(workerPath, 'utf8');
      for (const [code, injection] of [
        ['ARCHIVE_STDERR_LIMIT', "process.stderr.write(Buffer.alloc(131072, 65));"],
        ['ARCHIVE_DECODE_ERROR', "throw new Error('injected worker startup failure');"]
      ]) {
        await fs.writeFile(workerPath, original + '\\n' + injection);
        const budget = new WorkBudget(1, 0);
        await assert.rejects(readArchiveEntryBuffer(directory + '/pixel-rar4.cbr', 'pixel.png', { budget }), { code });
        for (let index = 0; index < 100 && budget.usage.active; index += 1) await new Promise(resolve => setTimeout(resolve, 10));
        assert.deepEqual(budget.usage, { active: 0, queued: 0 });
        console.log('production JS ' + code + ': worker terminated; permit recovered');
      }
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8", timeout: 20_000, env: { ...process.env, PATH: "", NODE_OPTIONS: "" }
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /production JS RAR4/);
    assert.match(result.stdout, /production JS RAR5/);
    console.log(result.stdout.trim());
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
