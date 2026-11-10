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
    await ensureScannedLibrary();
    await directoryWatcher.startWatching();
    await app.listen({
      host: env.host,
      port: env.port
    });
    cacheMaintenance.start(env.cacheGcIntervalHours * 3600_000);
    startCoverThumbnailWarmup({
      reason: "startup",
      concurrency: 2,
      limit: 300,
      recentLimit: 120
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
