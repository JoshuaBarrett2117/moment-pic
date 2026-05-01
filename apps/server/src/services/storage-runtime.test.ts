import assert from "node:assert/strict";
import test from "node:test";

import {
  StorageConfigError,
  resolveStorageRuntimePlanFromConfig
} from "./storage-runtime.js";

const createInput = (overrides?: Partial<Parameters<typeof resolveStorageRuntimePlanFromConfig>[0]>) => ({
  storageProfile: "auto",
  databaseUrl: "file:/data/gallery.sqlite",
  redisUrl: "",
  autoMigrateToPostgres: true,
  autoImportLegacyJson: true,
  storageMigrationStrategy: "fail-fast",
  ...overrides
});

test("resolveStorageRuntimePlanFromConfig keeps sqlite as default lite mode", () => {
  const plan = resolveStorageRuntimePlanFromConfig(createInput());

  assert.equal(plan.mode, "lite");
  assert.equal(plan.databaseEngine, "sqlite");
  assert.equal(plan.cacheEngine, "memory");
  assert.equal(plan.autoMigrateToPostgres, false);
});

test("resolveStorageRuntimePlanFromConfig switches to enhanced mode only when postgres and redis are both configured", () => {
  const plan = resolveStorageRuntimePlanFromConfig(
    createInput({
      databaseUrl: "postgresql://moment_pic:moment_pic@postgres:5432/moment_pic",
      redisUrl: "redis://redis:6379"
    })
  );

  assert.equal(plan.mode, "enhanced");
  assert.equal(plan.databaseEngine, "postgresql");
  assert.equal(plan.cacheEngine, "redis");
  assert.equal(plan.autoMigrateToPostgres, true);
});

test("resolveStorageRuntimePlanFromConfig rejects half-enhanced auto mode", () => {
  assert.throws(
    () =>
      resolveStorageRuntimePlanFromConfig(
        createInput({
          databaseUrl: "postgresql://moment_pic:moment_pic@postgres:5432/moment_pic",
          redisUrl: ""
        })
      ),
    (error: unknown) =>
      error instanceof StorageConfigError &&
      error.message.includes("必须同时出现或同时缺失")
  );
});

test("resolveStorageRuntimePlanFromConfig rejects incomplete forced enhanced mode", () => {
  assert.throws(
    () =>
      resolveStorageRuntimePlanFromConfig(
        createInput({
          storageProfile: "enhanced",
          databaseUrl: "file:/data/gallery.sqlite",
          redisUrl: ""
        })
      ),
    (error: unknown) =>
      error instanceof StorageConfigError &&
      error.message.includes("enhanced 模式要求同时配置 PostgreSQL DATABASE_URL 与 REDIS_URL")
  );
});
