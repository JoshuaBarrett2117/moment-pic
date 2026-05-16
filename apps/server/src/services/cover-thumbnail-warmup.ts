import { createLogger } from "../lib/logger.js";
import { warmupCoverThumbnails, type CoverThumbnailWarmupResult } from "./thumbnail-service.js";

const logger = createLogger("CoverThumbnailWarmup");

type CoverThumbnailWarmupInput = {
  reason: "startup" | "scan" | "watcher";
  libraryRootId?: string;
  concurrency?: number;
  limit?: number;
  recentLimit?: number;
};

const runningWarmupScopes = new Set<string>();

const buildWarmupScopeKey = (input: CoverThumbnailWarmupInput): string =>
  `${input.reason}:${input.libraryRootId ?? "all"}`;

export const startCoverThumbnailWarmup = (input: CoverThumbnailWarmupInput): void => {
  const scopeKey = buildWarmupScopeKey(input);
  if (runningWarmupScopes.has(scopeKey)) {
    logger.info(`封面缩略图预热已在运行，跳过重复任务：${scopeKey}`);
    return;
  }

  runningWarmupScopes.add(scopeKey);
  logger.info(`封面缩略图预热开始：${scopeKey}`);

  void warmupCoverThumbnails({
    libraryRootId: input.libraryRootId,
    concurrency: input.concurrency,
    limit: input.limit,
    recentLimit: input.recentLimit
  })
    .then((result: CoverThumbnailWarmupResult) => {
      logger.info(`封面缩略图预热完成：${scopeKey}`, result);
    })
    .catch((error) => {
      logger.error(`封面缩略图预热失败：${scopeKey}`, error);
    })
    .finally(() => {
      runningWarmupScopes.delete(scopeKey);
    });
};
