import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PORT, EnvConfigError, collectEnvWarnings, readNumber } from "./env.js";

test("数字型环境变量：未设置用默认值，非法值拒绝启动", () => {
  assert.equal(DEFAULT_PORT, 3210);
  assert.equal(readNumber("PORT", undefined, 3210, { min: 1, max: 65535, integer: true }), 3210);
  assert.equal(readNumber("PORT", "3211", 3210, { min: 1, max: 65535, integer: true }), 3211);
  for (const bad of ["abc", "0", "70000", "32.5"]) {
    assert.throws(() => readNumber("PORT", bad, 3210, { min: 1, max: 65535, integer: true }), EnvConfigError);
  }
  assert.throws(() => readNumber("CACHE_MAX_BYTES", "-1", 0), EnvConfigError);
});

test("废弃变量给出迁移提示", () => {
  const warnings = collectEnvWarnings({ LIBRARY_ROOT_PATH: "/x", DATABASE_URL: "file:a", INDEX_FILE_PATH: "", PORT: "1" });
  assert.equal(warnings.length, 2);
  assert.ok(warnings.some((item) => item.includes("LIBRARY_ROOTS")));
});
