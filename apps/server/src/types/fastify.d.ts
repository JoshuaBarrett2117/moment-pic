import "fastify";

import type { env } from "../config/env.js";
import type { ResolvedSession } from "../services/auth-service.js";

declare module "fastify" {
  interface FastifyInstance {
    config: typeof env;
    readFile: typeof import("node:fs/promises").readFile;
  }

  interface FastifyRequest {
    /** 已登录会话；公开路由（登录、健康检查、分享）上为 null */
    authSession: ResolvedSession | null;
  }
}
