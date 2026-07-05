import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { getSystemConfig, updateSystemConfig, type SystemConfigUpdateInput } from "../services/system-config-service.js";

export const systemConfigRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/system-config", async () => ok(await getSystemConfig()));

  app.patch("/api/v1/system-config", async (request) => {
    const body = request.body as SystemConfigUpdateInput;
    const result = await updateSystemConfig({
      enablePolling: body.enablePolling,
      pollingInterval: body.pollingInterval,
      preloadBefore: body.preloadBefore,
      preloadAfter: body.preloadAfter,
      defaultImageQualityPreset: body.defaultImageQualityPreset,
      pageTransitionMode: body.pageTransitionMode,
      albumListItemMinWidthMobile: body.albumListItemMinWidthMobile,
      albumListItemMinWidthDesktop: body.albumListItemMinWidthDesktop,
      albumDetailItemMinWidthMobile: body.albumDetailItemMinWidthMobile,
      albumDetailItemMinWidthDesktop: body.albumDetailItemMinWidthDesktop
    });
    return ok(result);
  });
};
