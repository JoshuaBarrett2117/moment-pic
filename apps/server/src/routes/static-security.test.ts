import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("升级静态插件后实际 HTML/JS 响应保留 UTF-8、禁缓存并阻止越界文件", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "momentpic-static-"));
  process.env.PUBLIC_DIR = path.join(directory, "public");
  await fs.mkdir(process.env.PUBLIC_DIR);
  await fs.writeFile(path.join(process.env.PUBLIC_DIR, "index.html"), "<!doctype html><title>图库</title>");
  await fs.writeFile(path.join(process.env.PUBLIC_DIR, "client.js"), "console.log('图库')");
  await fs.writeFile(path.join(directory, "private.txt"), "not-public");
  const { buildApp } = await import("../app.js");
  const app = buildApp();
  try {
    for (const url of ["/", "/nested/page"]) {
      const response = await app.inject(url);
      assert.equal(response.statusCode, 200);
      assert.match(String(response.headers["content-type"]), /text\/html; charset=utf-8/i);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.match(response.body, /图库/);
    }
    const script = await app.inject("/client.js");
    assert.equal(script.statusCode, 200);
    assert.match(String(script.headers["content-type"]), /javascript; charset=utf-8/i);
    for (const url of ["/../private.txt", "/%2e%2e/private.txt", "/%2e%2e%2fprivate.txt"]) {
      assert.ok(!(await app.inject(url)).body.includes("not-public"));
    }
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
