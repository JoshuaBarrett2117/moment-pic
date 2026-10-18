import assert from "node:assert/strict";
import test from "node:test";
import { resolveLogLevel, LOG_LEVELS } from "./log-level.js";
import { createLogger } from "../lib/logger.js";
import { env } from "./env.js";
import { buildApp } from "../app.js";

test("LOG_LEVEL 白名单与非法值回落 info，Fastify 使用配置等级", async () => {
  for (const level of LOG_LEVELS) assert.equal(resolveLogLevel(level), level);
  for (const invalid of [undefined, "", "WARN", "silent", "invalid"]) assert.equal(resolveLogLevel(invalid), "info");
  const previous = env.logLevel; env.logLevel = "error";
  const app = buildApp();
  try { assert.equal(app.log.level, "error"); } finally { await app.close(); env.logLevel = previous; }
});

test("业务 createLogger 同样遵守 LOG_LEVEL，warn 下不输出 info", (context) => {
  const previous = process.env.LOG_LEVEL; process.env.LOG_LEVEL = "warn";
  const log = context.mock.method(console, "log", () => {});
  const warn = context.mock.method(console, "warn", () => {});
  const error = context.mock.method(console, "error", () => {});
  try {
    const logger = createLogger("test"); logger.info("hidden"); logger.warn("visible"); logger.error("error");
    assert.equal(log.mock.callCount(), 0); assert.equal(warn.mock.callCount(), 1); assert.equal(error.mock.callCount(), 1);
  } finally { if (previous === undefined) delete process.env.LOG_LEVEL; else process.env.LOG_LEVEL = previous; }
});
