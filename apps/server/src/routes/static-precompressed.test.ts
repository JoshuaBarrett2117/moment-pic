import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";

test("静态资源：带哈希的 assets 永久缓存、优先发送预压缩文件，index.html 仍禁缓存", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "momentpic-static-br-"));
  process.env.PUBLIC_DIR = path.join(directory, "public");
  const assetsDir = path.join(process.env.PUBLIC_DIR, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  const html = "<!doctype html><title>图库</title>" + " ".repeat(2048);
  const script = "console.log('图库');".repeat(200);
  await fs.writeFile(path.join(process.env.PUBLIC_DIR, "index.html"), html);
  await fs.writeFile(path.join(process.env.PUBLIC_DIR, "index.html.br"), zlib.brotliCompressSync(html));
  await fs.writeFile(path.join(assetsDir, "index-abc123.js"), script);
  await fs.writeFile(path.join(assetsDir, "index-abc123.js.br"), zlib.brotliCompressSync(script));
  await fs.writeFile(path.join(assetsDir, "index-abc123.js.gz"), zlib.gzipSync(script));
  const { buildApp } = await import("../app.js");
  const app = buildApp();
  try {
    const br = await app.inject({ url: "/assets/index-abc123.js", headers: { "accept-encoding": "br, gzip" } });
    assert.equal(br.statusCode, 200);
    assert.equal(br.headers["content-encoding"], "br");
    assert.equal(br.headers["cache-control"], "public, max-age=31536000, immutable");
    assert.match(String(br.headers["content-type"]), /javascript/);
    assert.equal(zlib.brotliDecompressSync(br.rawPayload).toString(), script);

    const gz = await app.inject({ url: "/assets/index-abc123.js", headers: { "accept-encoding": "gzip" } });
    assert.equal(gz.headers["content-encoding"], "gzip");

    const plain = await app.inject({ url: "/assets/index-abc123.js" });
    assert.equal(plain.headers["content-encoding"], undefined);
    assert.equal(plain.body, script);

    const index = await app.inject({ url: "/", headers: { "accept-encoding": "br" } });
    assert.equal(index.statusCode, 200);
    assert.equal(index.headers["cache-control"], "no-store");
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
