import { env } from "../config/env.js";
import { getRedisClient, verifyRedisConnectivity } from "../cache/redis-client.js";
import { bootstrapPostgresStorage, verifyPostgresConnectivity } from "../db/postgres.js";
import { MemoryCacheStore } from "./memory-cache-store.js";
import { migrateSqliteToPostgres } from "./storage-migration.js";
import { RedisCacheStore } from "./redis-cache-store.js";
import { getGalleryRepository, setCacheStore, setGalleryRepository } from "./storage-provider.js";
import { postgresGalleryRepository } from "./postgres-gallery-repository.js";
import { sqliteGalleryRepository } from "./sqlite-gallery-repository.js";

export type StorageProfile = "auto" | "lite" | "enhanced";
export type StorageMode = "lite" | "enhanced";
export type DatabaseEngine = "sqlite" | "postgresql";
export type CacheEngine = "memory" | "redis";
export type StorageMigrationStrategy = "fail-fast" | "fallback-lite";

export type StorageRuntimePlan = {
  profile: StorageProfile;
  mode: StorageMode;
  databaseEngine: DatabaseEngine;
  cacheEngine: CacheEngine;
  needsMigration: boolean;
  autoMigrateToPostgres: boolean;
  autoImportLegacyJson: boolean;
  migrationStrategy: StorageMigrationStrategy;
};

export type StorageRuntimeConfigInput = {
  storageProfile: string;
  databaseUrl: string;
  redisUrl: string;
  autoMigrateToPostgres: boolean;
  autoImportLegacyJson: boolean;
  storageMigrationStrategy: string;
};

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigError";
  }
}

const normalizeStorageProfile = (value: string): StorageProfile => {
  if (value === "lite" || value === "enhanced") {
    return value;
  }
  return "auto";
};

const normalizeMigrationStrategy = (value: string): StorageMigrationStrategy => {
  if (value === "fallback-lite") {
    return value;
  }
  return "fail-fast";
};

const getDatabaseEngine = (databaseUrl: string): DatabaseEngine | null => {
  const normalized = databaseUrl.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("file:")) {
    return "sqlite";
  }
  if (normalized.startsWith("postgresql:") || normalized.startsWith("postgres:")) {
    return "postgresql";
  }
  return null;
};

export const resolveStorageRuntimePlanFromConfig = (input: StorageRuntimeConfigInput): StorageRuntimePlan => {
  const profile = normalizeStorageProfile(input.storageProfile);
  const migrationStrategy = normalizeMigrationStrategy(input.storageMigrationStrategy);
  const databaseEngine = getDatabaseEngine(input.databaseUrl);
  const hasRedis = Boolean(input.redisUrl);
  const hasPostgres = databaseEngine === "postgresql";
  const hasSqlite = databaseEngine === "sqlite";

  if (!databaseEngine) {
    throw new StorageConfigError(`unsupported DATABASE_URL: ${input.databaseUrl}`);
  }

  if (profile === "lite") {
    return {
      profile,
      mode: "lite",
      databaseEngine: "sqlite",
      cacheEngine: "memory",
      needsMigration: false,
      autoMigrateToPostgres: false,
      autoImportLegacyJson: input.autoImportLegacyJson,
      migrationStrategy
    };
  }

  if (profile === "enhanced") {
    if (!hasPostgres || !hasRedis) {
      throw new StorageConfigError("enhanced 模式要求同时配置 PostgreSQL DATABASE_URL 与 REDIS_URL");
    }

    return {
      profile,
      mode: "enhanced",
      databaseEngine: "postgresql",
      cacheEngine: "redis",
      needsMigration: input.autoMigrateToPostgres,
      autoMigrateToPostgres: input.autoMigrateToPostgres,
      autoImportLegacyJson: input.autoImportLegacyJson,
      migrationStrategy
    };
  }

  if (hasPostgres !== hasRedis) {
    throw new StorageConfigError("自动模式下，PostgreSQL DATABASE_URL 与 REDIS_URL 必须同时出现或同时缺失");
  }

  if (hasPostgres && hasRedis) {
    return {
      profile,
      mode: "enhanced",
      databaseEngine: "postgresql",
      cacheEngine: "redis",
      needsMigration: input.autoMigrateToPostgres,
      autoMigrateToPostgres: input.autoMigrateToPostgres,
      autoImportLegacyJson: input.autoImportLegacyJson,
      migrationStrategy
    };
  }

  if (!hasSqlite) {
    throw new StorageConfigError("轻量模式要求 DATABASE_URL 使用 SQLite file: 协议，或显式配置增强模式依赖");
  }

  return {
    profile,
    mode: "lite",
    databaseEngine: "sqlite",
    cacheEngine: "memory",
    needsMigration: false,
    autoMigrateToPostgres: false,
    autoImportLegacyJson: input.autoImportLegacyJson,
    migrationStrategy
  };
};

export const resolveStorageRuntimePlan = (): StorageRuntimePlan =>
  resolveStorageRuntimePlanFromConfig({
    storageProfile: env.storageProfile,
    databaseUrl: env.databaseUrl,
    redisUrl: env.redisUrl,
    autoMigrateToPostgres: env.autoMigrateToPostgres,
    autoImportLegacyJson: env.autoImportLegacyJson,
    storageMigrationStrategy: env.storageMigrationStrategy
  });

export const initializeStorageRuntime = async (): Promise<StorageRuntimePlan> => {
  const plan = resolveStorageRuntimePlan();

  if (plan.mode === "lite") {
    setGalleryRepository(sqliteGalleryRepository);
    setCacheStore(new MemoryCacheStore());
    return plan;
  }

  await verifyPostgresConnectivity();
  await bootstrapPostgresStorage();
  await verifyRedisConnectivity();
  if (plan.autoMigrateToPostgres) {
    await migrateSqliteToPostgres();
  }
  setGalleryRepository(postgresGalleryRepository);
  setCacheStore(new RedisCacheStore(getRedisClient()));
  return plan;
};

export const getCurrentRepositoryLabel = (): string => {
  const current = getGalleryRepository();
  if (current === sqliteGalleryRepository) {
    return "sqlite";
  }
  if (current === postgresGalleryRepository) {
    return "postgresql";
  }
  return "custom";
};
