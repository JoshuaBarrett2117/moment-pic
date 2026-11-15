import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { buildApp } from "../app.js";
import { env } from "../config/env.js";
import { createLanClassifier } from "../lib/lan-network.js";
import { deleteAlbumDb, insertAlbumWithAssetsDb } from "../repositories/album-repository.js";
import { deleteLibraryRootDb, upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import { createAlbumShare } from "../services/album-service.js";
import { testSessionCookie } from "../test-support/session.js";

const withNetworkEnv = async (options: { trustedProxies: string[]; cidrs?: string[]; excludeIps?: string[] }, run: (app: ReturnType<typeof buildApp>) => Promise<void>) => {
  const previous = { trustedProxies: env.trustedProxies, lanClassifier: env.lanClassifier };
  env.trustedProxies = options.trustedProxies;
  env.lanClassifier = createLanClassifier({ cidrs: options.cidrs, excludeIps: options.excludeIps });
  const app = buildApp();
  try { await run(app); } finally { await app.close(); Object.assign(env, previous); }
};

test("GET /api/v1/network 需要登录；直连按套接字地址判定内外网，回环为外网", async () => {
  await withNetworkEnv({ trustedProxies: [] }, async (app) => {
    assert.equal((await app.inject({ url: "/api/v1/network", remoteAddress: "192.168.31.117" })).statusCode, 401);
    const cookie = testSessionCookie();
    const lan = await app.inject({ url: "/api/v1/network", remoteAddress: "192.168.31.117", headers: { cookie } });
    assert.equal(lan.statusCode, 200);
    assert.deepEqual(lan.json().data, { network: "lan", clientIp: "192.168.31.117" });
    assert.equal(lan.headers["cache-control"], "no-store");
    const loop = await app.inject({ url: "/api/v1/network", remoteAddress: "127.0.0.1", headers: { cookie } });
    assert.equal(loop.json().data.network, "wan");
    // 未配置可信代理时，伪造的 X-Forwarded-For 不生效
    const spoof = await app.inject({ url: "/api/v1/network", remoteAddress: "8.8.8.8", headers: { cookie, "x-forwarded-for": "192.168.31.5" } });
    assert.deepEqual(spoof.json().data, { network: "wan", clientIp: "8.8.8.8" });
  });
});

test("反代场景：只信任 TRUSTED_PROXIES，取 X-Forwarded-For 最右侧不可信地址；反代自身被排除", async () => {
  await withNetworkEnv({ trustedProxies: ["192.168.31.12"], cidrs: ["192.168.31.0/24"], excludeIps: ["192.168.31.12"] }, async (app) => {
    const cookie = testSessionCookie();
    const get = async (remoteAddress: string, xff?: string) =>
      (await app.inject({ url: "/api/v1/network", remoteAddress, headers: xff ? { cookie, "x-forwarded-for": xff } : { cookie } })).json().data;
    assert.deepEqual(await get("192.168.31.12", "192.168.31.117"), { network: "lan", clientIp: "192.168.31.117" });
    // 外网经 CDN → 反代：客户端伪造的内网 XFF 在 CDN 节点之前，不会被采信
    assert.deepEqual(await get("192.168.31.12", "192.168.31.5, 2409:8c34:2220:30b:2::10e5"), { network: "wan", clientIp: "2409:8c34:2220:30b:2::10e5" });
    // 反代没带 XFF（自身发起）→ NAS 自身地址被排除
    assert.equal((await get("192.168.31.12")).network, "wan");
    // 同机其他容器（docker 网桥）直连
    assert.equal((await get("172.17.0.13", "192.168.31.117")).network, "wan");
    // IPv4 映射地址
    assert.equal((await get("::ffff:192.168.31.117")).network, "lan");
  });
});

test("系统配置：内网默认画质默认原图，可单独修改，非法值 400", async () => {
  const app = buildApp();
  const cookie = testSessionCookie();
  try {
    const before = (await app.inject({ url: "/api/v1/system-config", headers: { cookie } })).json().data;
    assert.ok(["low", "balanced", "high", "original"].includes(before.lanImageQualityPreset));
    const patched = await app.inject({ method: "PATCH", url: "/api/v1/system-config", headers: { cookie }, payload: { lanImageQualityPreset: "high", defaultImageQualityPreset: "balanced" } });
    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().data.lanImageQualityPreset, "high");
    assert.equal(patched.json().data.defaultImageQualityPreset, "balanced");
    const onlyWan = await app.inject({ method: "PATCH", url: "/api/v1/system-config", headers: { cookie }, payload: { defaultImageQualityPreset: "low" } });
    assert.equal(onlyWan.json().data.lanImageQualityPreset, "high");
    for (const payload of [{ lanImageQualityPreset: "ultra" }, { defaultImageQualityPreset: 3 }]) {
      const bad = await app.inject({ method: "PATCH", url: "/api/v1/system-config", headers: { cookie }, payload });
      assert.equal(bad.statusCode, 400, JSON.stringify(payload));
    }
    assert.equal((await app.inject({ url: "/api/v1/system-config", headers: { cookie } })).json().data.lanImageQualityPreset, "high");
    await app.inject({ method: "PATCH", url: "/api/v1/system-config", headers: { cookie }, payload: { lanImageQualityPreset: before.lanImageQualityPreset, defaultImageQualityPreset: before.defaultImageQualityPreset } });
  } finally { await app.close(); }
});

test("分享页会话返回 network（内网 / 外网），不返回 IP", async () => {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "share-network-"));
  const imagePath = path.join(directory, "1.png");
  await sharp({ create: { width: 8, height: 8, channels: 3, background: "#336699" } }).png().toFile(imagePath);
  upsertLibraryRootDb({ id, name: id, path: directory, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  insertAlbumWithAssetsDb(
    { id, libraryRootId: id, name: "分享网络", sourcePath: directory, sourceType: "folder", sourceMtime: null, assetsFingerprint: null, coverAssetId: id, assetCount: 1, scanStatus: "ready", errorMessage: null, createdAt: timestamp, updatedAt: timestamp },
    [{ id, albumId: id, name: "1.png", extension: "png", sourceType: "folder", sourcePath: imagePath, relativePath: null, zipEntryPath: null, sortIndex: 1, width: 8, height: 8, sizeBytes: null, sourceMtime: null, thumbnailKey: null, createdAt: timestamp, updatedAt: timestamp }]
  );
  try {
    await withNetworkEnv({ trustedProxies: [] }, async (app) => {
      const share = (await createAlbumShare(id, { password: "net-pass", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), origin: "https://photos.example" }))!;
      const base = `/api/v1/shares/${share.token}`;
      const login = await app.inject({ method: "POST", url: `${base}/auth`, remoteAddress: "192.168.1.20", payload: { password: "net-pass" } });
      assert.equal(login.statusCode, 200);
      assert.equal(login.json().data.network, "lan");
      assert.ok(!login.body.includes("192.168.1.20"));
      const cookieHeader = String(login.headers["set-cookie"]).split(";")[0];
      const session = await app.inject({ url: `${base}/session`, remoteAddress: "8.8.4.4", headers: { cookie: cookieHeader } });
      assert.equal(session.statusCode, 200);
      assert.equal(session.json().data.network, "wan");
      assert.ok(!session.body.includes("8.8.4.4"));
    });
  } finally {
    deleteAlbumDb(id); deleteLibraryRootDb(id);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
