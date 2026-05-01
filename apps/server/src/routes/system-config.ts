import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { directoryWatcher } from "../services/directory-watcher.js";
import { getGalleryRepository } from "../services/storage-provider.js";

export const systemConfigRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/system-config", async () => ok(await getGalleryRepository().getSystemConfig()));

  app.patch("/api/v1/system-config", async (request) => {
    const body = request.body as { enablePolling?: boolean; pollingInterval?: number; preloadBefore?: number; preloadAfter?: number; defaultImageQualityPreset?: "low" | "balanced" | "high" | "original"; albumListItemMinWidthMobile?: number; albumListItemMinWidthDesktop?: number; albumDetailItemMinWidthMobile?: number; albumDetailItemMinWidthDesktop?: number };
    const result = await getGalleryRepository().updateSystemConfig({
      enablePolling: body.enablePolling,
      pollingInterval: body.pollingInterval,
      preloadBefore: body.preloadBefore,
      preloadAfter: body.preloadAfter,
      defaultImageQualityPreset: body.defaultImageQualityPreset,
      albumListItemMinWidthMobile: body.albumListItemMinWidthMobile,
      albumListItemMinWidthDesktop: body.albumListItemMinWidthDesktop,
      albumDetailItemMinWidthMobile: body.albumDetailItemMinWidthMobile,
      albumDetailItemMinWidthDesktop: body.albumDetailItemMinWidthDesktop
    });
    await directoryWatcher.restartWatching();
    return ok(result);
  });
};
