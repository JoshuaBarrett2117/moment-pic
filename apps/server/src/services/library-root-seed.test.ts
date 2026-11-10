import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getDb } from "../db/sqlite.js";
import { listLibraryRootsDb, updateLibraryRootDb } from "../repositories/library-root-repository.js";
import { seedLibraryRootsFromEnv } from "./library-root-seed.js";

const reset = () => getDb().exec("DELETE FROM library_roots");

test("LIBRARY_ROOTS 中存在的目录会被登记，重复启动不重复登记", (context) => {
  reset();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-root-"));
  context.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = seedLibraryRootsFromEnv([dir, `${dir}/`]);
  assert.equal(first.added.length, 1);
  assert.equal(first.added[0].name, path.basename(dir));
  assert.equal(first.added[0].enabled, true);
  assert.equal(seedLibraryRootsFromEnv([dir]).added.length, 0);
  assert.equal(listLibraryRootsDb().length, 1);
});

test("不存在的路径和文件会跳过并给出原因", (context) => {
  reset();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-root-"));
  context.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "a.txt");
  fs.writeFileSync(file, "x");
  const result = seedLibraryRootsFromEnv([path.join(dir, "missing"), file]);
  assert.equal(result.added.length, 0);
  assert.deepEqual(result.skipped.map((item) => item.reason), ["目录不存在或无权访问", "不是目录"]);
  assert.equal(listLibraryRootsDb().length, 0);
});

test("已禁用的目录保持禁用，不被重新启用", (context) => {
  reset();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-root-"));
  context.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const [root] = seedLibraryRootsFromEnv([dir]).added;
  updateLibraryRootDb(root.id, { enabled: false });
  assert.equal(seedLibraryRootsFromEnv([dir]).added.length, 0);
  assert.equal(listLibraryRootsDb()[0].enabled, false);
});
