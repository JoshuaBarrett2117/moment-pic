import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverTests } from "./discover-tests.mjs";

test("递归显式发现 ts/tsx，包括多层和含空格路径，不包含普通源码", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "momentpic discovery "));
  try {
    await mkdir(path.join(directory, "one/two"), { recursive: true });
    for (const name of ["root.test.ts", "one/a.test.tsx", "one/two/deep.test.ts", "one/two/source.ts"]) {
      await writeFile(path.join(directory, name), "");
    }
    assert.deepEqual((await discoverTests(directory)).map((file) => path.relative(directory, file).split(path.sep).join("/")),
      ["one/a.test.tsx", "one/two/deep.test.ts", "root.test.ts"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("两工作区使用递归发现，所有镜像发布 job 依赖独立质量门禁", async () => {
  for (const workspace of ["server", "web"]) {
    const manifest = JSON.parse(await readFile(new URL(`../apps/${workspace}/package.json`, import.meta.url), "utf8"));
    assert.match(manifest.scripts.test, new RegExp(`test-workspace.mjs ${workspace}`));
    assert.match(manifest.scripts.typecheck, /tsc.*--noEmit/);
  }
  const workflow = await readFile(new URL("../.github/workflows/docker.yml", import.meta.url), "utf8");
  const runner = await readFile(new URL("./test-workspace.mjs", import.meta.url), "utf8");
  assert.match(runner, /TSX_TSCONFIG_PATH/);
  assert.match(workflow, /  quality:\n/);
  assert.match(workflow, /apt-get install[^\n]*7zip 7zip-rar/);
  for (const block of workflow.split(/(?=^  [\w-]+:\n)/m)) {
    if (/docker\/build-push-action/.test(block)) assert.match(block, /needs:.*quality/);
  }
  for (const command of ["test:discovery", "typecheck", "npm test", "build:server", "build:web"]) {
    assert.ok(workflow.includes(command), command);
  }
});
