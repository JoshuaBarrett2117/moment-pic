import "dotenv/config";

import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startCoverThumbnailWarmup } from "./services/cover-thumbnail-warmup.js";
import { ensureScannedLibrary } from "./services/library-scanner.js";
import { directoryWatcher } from "./services/directory-watcher.js";

const start = async () => {
  const app = buildApp();

  try {
    await ensureScannedLibrary();
    await directoryWatcher.startWatching();
    await app.listen({
      host: env.host,
      port: env.port
    });
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
