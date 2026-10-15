import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import chokidar from "chokidar";
import Fastify from "fastify";
import { WebSocket } from "ws";
import { env } from "../config/env.js";
import { createAuthToken } from "../lib/auth.js";
import { deleteLibraryRootDb, upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import { updateSystemConfigDb } from "../repositories/system-config-repository.js";
import { directoryWatcher } from "./directory-watcher.js";
import { wsService } from "./websocket-service.js";

test("真实目录监听事件经认证 WS 广播只包含图库相对路径", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "watcher-private-"));
  const id = randomUUID();
  updateSystemConfigDb({ enablePolling: true, pollingInterval: 50 });
  const timestamp = new Date().toISOString();
  upsertLibraryRootDb({ id, path: directory, name: id, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  const app = Fastify();
  app.decorate("config", { ...env, wsAllowedOrigins: ["https://photos.example"] });
  wsService.initialize(app);
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const client = new WebSocket(address.replace("http", "ws") + "/ws", { headers: { origin: "https://photos.example", cookie: `moment_pic_auth=${createAuthToken(env.adminPassword, Date.now() + 60_000)}` } });
  const originalWatch = chokidar.watch.bind(chokidar);
  let ready: Promise<unknown> = Promise.resolve();
  context.mock.method(chokidar, "watch", (...args: Parameters<typeof chokidar.watch>) => {
    const watcher = originalWatch(...args);
    ready = once(watcher, "ready", { signal: AbortSignal.timeout(5000) });
    return watcher;
  });
  try {
    await once(client, "open");
    await directoryWatcher.startWatching(id);
    await ready;
    const message = once(client, "message", { signal: AbortSignal.timeout(5000) });
    await fs.writeFile(path.join(directory, "page.png"), "watcher event fixture");
    const text = String((await message)[0]);
    assert.equal(JSON.parse(text).event.path, "page.png");
    assert.ok(!text.includes(directory));
    assert.ok(!text.includes("watcher-private"));
  } finally {
    directoryWatcher.stopWatching();
    client.terminate();
    await app.close();
    deleteLibraryRootDb(id);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
