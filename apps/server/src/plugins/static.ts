import path from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import type { FastifyPluginAsync } from "fastify";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, "../public");

export const staticPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/"
  });
};
