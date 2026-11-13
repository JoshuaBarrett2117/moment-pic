import "dotenv/config";

import { installGracefulShutdown } from "./services/graceful-shutdown.js";
import { CacheMaintenance } from "./services/cache-maintenance.js";
import { buildApp } from "./app.js";
import { collectEnvWarnings, env } from "./config/env.js";
import { startCoverThumbnailWarmup } from "./services/cover-thumbnail-warmup.js";
import { ensureScannedLibrary } from "./services/library-scanner.js";
import { directoryWatcher } from "./services/directory-watcher.js";
import { seedLibraryRootsFromEnv } from "./services/library-root-seed.js";

const start = async () => {
  const app = buildApp();
  for (const warning of collectEnvWarnings()) app.log.warn(warning);
  const cacheMaintenance = new CacheMaintenance({ cacheDir: env.cacheDir, maxBytes: env.cacheMaxBytes, minAgeMs: env.cacheGcMinAgeHours * 3600_000 });
  app.addHook("onClose", async () => cacheMaintenance.stop());
  installGracefulShutdown({ stopWatching: () => directoryWatcher.stopWatching(), close: () => app.close() });

  try {
    if (env.libraryRootsConfigured) {
      const seeded = seedLibraryRootsFromEnv(env.libraryRootPaths);
      for (const root of seeded.added) app.log.info({ path: root.path }, "已从 LIBRARY_ROOTS 登记图库目录");
      for (const item of seeded.skipped) app.log.warn({ path: item.path }, `LIBRARY_ROOTS 中的目录未登记：${item.reason}`);
    }
    // 先监听端口：空库首次启动的全量扫描可能要很久，期间健康检查与登录页都应可用。
    await app.listen({
      host: env.host,
      port: env.port
    });
    await directoryWatcher.startWatching();
    cacheMaintenance.start(env.cacheGcIntervalHours * 3600_000);
    const warmCovers = () => startCoverThumbnailWarmup({
      reason: "startup",
      concurrency: 2,
      limit: 300,
      recentLimit: 120
    });
    // 首次扫描在后台经 scanCoordinator 串行执行，进度见 /api/v1/health 的 scan 字段。
    void ensureScannedLibrary()
      .then((scanned) => {
        if (scanned) app.log.info("首次图库扫描完成");
      })
      .catch((error: unknown) => app.log.error({ err: error }, "首次图库扫描失败，可在设置页手动重新扫描"))
      .finally(warmCovers);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
