import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildApp } from "../app.js";
import { env } from "../config/env.js";
import { getDb } from "../db/sqlite.js";

test("health 数据库路径不可用返回 503，免鉴权且不泄露路径", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "health-unavailable-"));
  const previous = env.sqlitePath;
  const blocked = path.join(directory, "not-a-directory");
  await fs.writeFile(blocked, "blocked"); env.sqlitePath = path.join(blocked, "db.sqlite");
  const app = buildApp();
  try {
    const response = await app.inject("/api/v1/health");
    assert.equal(response.statusCode, 503); assert.equal(response.json().data.status, "error");
    assert.equal(response.json().data.db, "error"); assert.ok(!response.body.includes(directory));
    assert.equal(response.headers["cache-control"], "no-store");
  } finally { await app.close(); env.sqlitePath = previous; await fs.rm(directory, { recursive: true, force: true }); }
});

test("health SELECT 1 成功返回真实版本、uptime/时延，SQLite 锁等待为 2000ms", async () => {
  const app = buildApp();
  try {
    const response = await app.inject("/api/v1/health");
    assert.equal(response.statusCode, 200);
    const health = response.json().data;
    const pkg = JSON.parse(await fs.readFile(new URL("../../package.json", import.meta.url), "utf8"));
    assert.equal(health.version, pkg.version); assert.equal(health.status, "ok"); assert.equal(health.db, "ok");
    assert.ok(health.uptime > 0); assert.ok(health.dbLatencyMs >= 0);
    assert.equal(getDb().pragma("busy_timeout", { simple: true }), 2000);
  } finally { await app.close(); }
});
