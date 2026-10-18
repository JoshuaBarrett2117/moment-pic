import "dotenv/config";

import { installGracefulShutdown } from "./services/graceful-shutdown.js";
import { CacheMaintenance } from "./services/cache-maintenance.js";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startCoverThumbnailWarmup } from "./services/cover-thumbnail-warmup.js";
import { ensureScannedLibrary } from "./services/library-scanner.js";
import { directoryWatcher } from "./services/directory-watcher.js";

const start = async () => {
  const app = buildApp();
  const cacheMaintenance = new CacheMaintenance({ cacheDir: env.cacheDir, maxBytes: env.cacheMaxBytes, minAgeMs: env.cacheGcMinAgeHours * 3600_000 });
  app.addHook("onClose", async () => cacheMaintenance.stop());
  installGracefulShutdown({ stopWatching: () => directoryWatcher.stopWatching(), close: () => app.close() });

  try {
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
