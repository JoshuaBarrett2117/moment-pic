import "dotenv/config";

import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { ensureScannedLibrary } from "./services/library-scanner.js";
import { directoryWatcher } from "./services/directory-watcher.js";
import { getCurrentRepositoryLabel, initializeStorageRuntime } from "./services/storage-runtime.js";

const start = async () => {
  const app = buildApp();

  try {
    const storagePlan = await initializeStorageRuntime();
    app.log.info(
      {
        storageProfile: storagePlan.profile,
        storageMode: storagePlan.mode,
        databaseEngine: storagePlan.databaseEngine,
        cacheEngine: storagePlan.cacheEngine,
        needsMigration: storagePlan.needsMigration,
        repository: getCurrentRepositoryLabel()
      },
      "storage runtime initialized"
    );
    await ensureScannedLibrary();
    await directoryWatcher.startWatching();
    await app.listen({
      host: env.host,
      port: env.port
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
