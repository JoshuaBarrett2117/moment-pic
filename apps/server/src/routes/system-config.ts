import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { getSystemConfigDb, updateSystemConfigDb } from "../services/sqlite-store.js";
import { directoryWatcher } from "../services/directory-watcher.js";

export const systemConfigRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/system-config", async () => ok(await getSystemConfigDb()));

  app.patch("/api/v1/system-config", async (request) => {
    const body = request.body as { enablePolling?: boolean; pollingInterval?: number; preloadBefore?: number; preloadAfter?: number };
    const result = await updateSystemConfigDb({
      enablePolling: body.enablePolling,
      pollingInterval: body.pollingInterval,
      preloadBefore: body.preloadBefore,
      preloadAfter: body.preloadAfter
    });
    await directoryWatcher.restartWatching();
    return ok(result);
  });
};
