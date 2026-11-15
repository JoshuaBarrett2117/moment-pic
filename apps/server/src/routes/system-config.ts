import type { FastifyPluginAsync } from "fastify";

import { ok } from "../lib/api.js";
import { isImageQualityPreset } from "../repositories/system-config-repository.js";
import { getSystemConfig, updateSystemConfig, type SystemConfigUpdateInput } from "../services/system-config-service.js";

const QUALITY_FIELDS = ["defaultImageQualityPreset", "lanImageQualityPreset"] as const;

export const systemConfigRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/system-config", async () => ok(await getSystemConfig()));

  app.patch("/api/v1/system-config", async (request, reply) => {
    const body = (request.body ?? {}) as SystemConfigUpdateInput;
    for (const field of QUALITY_FIELDS) {
      if (body[field] !== undefined && !isImageQualityPreset(body[field])) {
        return reply.status(400).send({ code: 4000, message: `${field} 只能是 low / balanced / high / original` });
      }
    }
    const result = await updateSystemConfig({
      enablePolling: body.enablePolling,
      pollingInterval: body.pollingInterval,
      preloadBefore: body.preloadBefore,
      preloadAfter: body.preloadAfter,
      defaultImageQualityPreset: body.defaultImageQualityPreset,
      lanImageQualityPreset: body.lanImageQualityPreset,
      pageTransitionMode: body.pageTransitionMode,
      albumListItemMinWidthMobile: body.albumListItemMinWidthMobile,
      albumListItemMinWidthDesktop: body.albumListItemMinWidthDesktop,
      albumDetailItemMinWidthMobile: body.albumDetailItemMinWidthMobile,
      albumDetailItemMinWidthDesktop: body.albumDetailItemMinWidthDesktop
    });
    return ok(result);
  });
};
