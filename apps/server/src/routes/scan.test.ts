import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import sharp from "sharp";
import { WebSocket } from "ws";
import { buildApp } from "../app.js";
import { testSessionCookie } from "../test-support/session.js";
import { deleteLibraryRootDb, upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import { updateAlbumScanStatusDb } from "../repositories/album-repository.js";
import { clearAlbumListCache } from "../services/album-service.js";

test("实际扫描 API 与 WebSocket 暴露脱敏失败及部分成果，失败任务可轮询", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "scan-route-private-"));
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  await fs.mkdir(path.join(directory, "healthy"));
  await sharp({ create: { width: 16, height: 16, channels: 3, background: "red" } }).png().toFile(path.join(directory, "healthy/page.png"));
  await fs.writeFile(path.join(directory, "broken.zip"), "invalid archive");
  upsertLibraryRootDb({ id, name: id, path: directory, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  const app = buildApp();
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const cookie = testSessionCookie(60_000);
  const client = new WebSocket(address.replace("http", "ws") + "/ws", { headers: { origin: address, cookie } });
  try {
    await once(client, "open");
    for (const root of [id, "unknown-root"]) {
      const message = once(client, "message", { signal: AbortSignal.timeout(5000) });
      const created = (await app.inject({ method: "POST", url: "/api/v1/scan", headers: { cookie }, payload: { libraryRootId: root } })).json().data;
      assert.equal(created.libraryRootId, root);
      const event = JSON.parse(String((await message)[0]));
      assert.equal(event.type, "scan_complete");
      assert.ok(event.event.failureCount > 0);
      assert.ok(!JSON.stringify(event).includes(directory));
      let task = (await app.inject({ url: `/api/v1/scan/${created.taskId}`, headers: { cookie } })).json().data;
      for (let index = 0; index < 100 && ["pending", "running"].includes(task.warmupStatus); index += 1) {
        await delay(20);
        task = (await app.inject({ url: `/api/v1/scan/${created.taskId}`, headers: { cookie } })).json().data;
      }
      assert.equal(task.status, "failed");
      assert.equal(task.outcome, root === id ? "partial" : "failed");
      assert.ok(task.failureCount > 0);
      assert.ok(task.error);
      assert.ok(!JSON.stringify(task).includes(directory));
      if (root === id) assert.equal(task.albumsDiscovered, 1);
    }
    const list = await app.inject({ url: "/api/v1/scan", headers: { cookie } });
    assert.ok(!list.body.includes(directory));
    const albumsUrl = `/api/v1/albums?libraryRootId=${id}`;
    const albumId = (await app.inject({ url: albumsUrl, headers: { cookie } })).json().data.items[0].id;
    updateAlbumScanStatusDb(albumId, "error", `legacy error: ${directory}`);
    clearAlbumListCache();
    const albums = await app.inject({ url: albumsUrl, headers: { cookie } });
    assert.ok(!albums.body.includes(directory));
    await fs.rm(path.join(directory, "healthy"), { recursive: true });
    const rescan = await app.inject({ method: "POST", url: `/api/v1/albums/${albumId}/rescan`, headers: { cookie } });
    assert.equal(rescan.statusCode, 500);
    assert.ok(!rescan.body.includes(directory));
  } finally { client.terminate(); await app.close(); deleteLibraryRootDb(id); await fs.rm(directory, { recursive: true, force: true }); }
});

test("POST /api/v1/scan：同范围扫描排队/执行中时合并为同一任务（alreadyRunning）", async () => {
  const { scanCoordinator } = await import("../services/scan-coordinator.js");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "scan-route-coalesce-"));
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  upsertLibraryRootDb({ id, name: id, path: directory, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  const app = buildApp();
  const cookie = testSessionCookie(60_000);
  let release: () => void = () => undefined;
  // 先占住协调器，确保两次请求时扫描都还在排队
  const blocker = scanCoordinator.runExclusive("test-blocker", () => new Promise<void>((resolve) => { release = resolve; }));
  try {
    const post = async () => (await app.inject({ method: "POST", url: "/api/v1/scan", headers: { cookie }, payload: { libraryRootId: id } })).json().data;
    const first = await post();
    const second = await post();
    assert.equal(first.alreadyRunning, false);
    assert.equal(first.status, "pending");
    assert.equal(second.alreadyRunning, true);
    assert.equal(second.taskId, first.taskId);
    release();
    await blocker;
    await scanCoordinator.drain();
    let task = (await app.inject({ url: `/api/v1/scan/${first.taskId}`, headers: { cookie } })).json().data;
    for (let index = 0; index < 100 && ["pending", "running"].includes(task.status); index += 1) {
      await delay(20);
      task = (await app.inject({ url: `/api/v1/scan/${first.taskId}`, headers: { cookie } })).json().data;
    }
    assert.equal(task.status, "completed");
    const third = await post();
    assert.equal(third.alreadyRunning, false);
    assert.notEqual(third.taskId, first.taskId);
    await scanCoordinator.drain();
  } finally { release(); await app.close(); deleteLibraryRootDb(id); await fs.rm(directory, { recursive: true, force: true }); }
});
