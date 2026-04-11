import "dotenv/config";

import { buildApp } from "./app.js";
import { env } from "./config/env.js";
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
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
