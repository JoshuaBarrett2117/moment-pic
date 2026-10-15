import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import Fastify from "fastify";
import { WebSocket } from "ws";
import { env } from "../config/env.js";
import { createAuthToken } from "../lib/auth.js";
import { WebSocketService } from "./websocket-service.js";

const fixture = async (limits = { global: 3, perClient: 2, bufferedBytes: 4096 }) => {
  const app = Fastify();
  app.decorate("config", { ...env, wsAllowedOrigins: ["https://photos.example"] });
  const service = new WebSocketService(limits);
  service.initialize(app);
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const cookie = (ttl = 60_000) => `moment_pic_auth=${createAuthToken(env.adminPassword, Date.now() + ttl)}`;
  const connect = async (ttl?: number) => {
    const client = new WebSocket(address.replace("http", "ws") + "/ws", { headers: { origin: "https://photos.example", cookie: cookie(ttl) } });
    await once(client, "open");
    return client;
  };
  const upgradeStatus = (headers: Record<string, string>, url = "/ws") => new Promise<number>((resolve, reject) => {
    const request = http.request(address + url, { headers: { connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "13", "sec-websocket-key": Buffer.alloc(16).toString("base64"), ...headers } });
    request.on("response", (response) => { response.resume(); resolve(response.statusCode!); });
    request.on("upgrade", (_response, socket) => { socket.destroy(); resolve(101); });
    request.on("error", reject);
    request.end();
  });
  return { app, service, cookie, connect, upgradeStatus, address };
};

test("拒绝真实升级后，不配合关闭的半开客户端也在有界时间内回收", async () => {
  const data = await fixture();
  const address = new URL(data.address);
  const socket = net.createConnection({ host: address.hostname, port: Number(address.port), allowHalfOpen: true });
  socket.on("error", () => {});
  try {
    await once(socket, "connect");
    const response = once(socket, "data");
    socket.write(`GET /ws HTTP/1.1\r\nHost: ${address.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${Buffer.alloc(16).toString("base64")}\r\nOrigin: https://photos.example\r\n\r\n`);
    assert.match(String((await response)[0]), /401/);
    await delay(400);
    const count = await new Promise<number>((resolve, reject) => data.app.server.getConnections((error, connections) => error ? reject(error) : resolve(connections)));
    assert.equal(count, 0);
    assert.equal(data.service.getClientCount(), 0);
  } finally { socket.destroy(); await data.app.close(); }
});

test("真实 HTTP Upgrade 拒绝匿名、恶意 Origin、异常 cookie、过期 token 和异常路径", async () => {
  const data = await fixture();
  try {
    assert.equal(await data.upgradeStatus({ origin: "https://photos.example" }), 401);
    assert.equal(await data.upgradeStatus({ origin: "https://evil.example", cookie: data.cookie() }), 403);
    assert.equal(await data.upgradeStatus({ origin: "null", cookie: data.cookie() }), 403);
    assert.equal(await data.upgradeStatus({ cookie: data.cookie() }), 403);
    for (const origin of ["http://photos.example", "https://photos.example:444", "https://photos.example/", "https://user@photos.example", "https://photos.example.evil", "https://forwarded.example"]) {
      assert.equal(await data.upgradeStatus({ origin, cookie: data.cookie(), "x-forwarded-host": "forwarded.example", "x-forwarded-proto": "https" }), 403);
    }
    assert.equal(await data.upgradeStatus({ origin: "https://photos.example", cookie: `bad=%ZZ; ${data.cookie()}` }), 401);
    assert.equal(await data.upgradeStatus({ origin: "https://photos.example", cookie: data.cookie(-1) }), 401);
    assert.equal(await data.upgradeStatus({ origin: "https://photos.example", cookie: data.cookie() }, "/ws?bad=1"), 400);
    assert.equal(data.service.getClientCount(), 0);
  } finally { await data.app.close(); }
});

test("认证连接仅收到相对路径，绝对路径/穿越不泄漏；会话到期主动关闭", async () => {
  const data = await fixture();
  try {
    const client = await data.connect(700);
    for (const value of ["album/page.jpg", "/private/mount/image.jpg", "C:\\private\\image.jpg", "../secret"]) {
      const message = once(client, "message");
      data.service.sendFileChange({ type: "change", path: value, libraryRootId: "root-id", timestamp: new Date().toISOString() });
      const [raw] = await message;
      const received = JSON.parse(raw.toString());
      assert.equal(received.event.path, value === "album/page.jpg" ? value : "");
      assert.ok(!raw.toString().includes("private"));
    }
    const [code] = await once(client, "close");
    assert.equal(code, 4001);
  } finally { await data.app.close(); }
});

test("全局/每客户端连接预算及发送预算超限后回收", async () => {
  for (const limits of [{ global: 1, perClient: 3, bufferedBytes: 128 }, { global: 3, perClient: 1, bufferedBytes: 128 }]) {
    const data = await fixture(limits);
    try {
      const client = await data.connect();
      assert.equal(await data.upgradeStatus({ origin: "https://photos.example", cookie: data.cookie() }), 429);
      const closed = once(client, "close");
      data.service.sendFileChange({ type: "change", path: "a".repeat(256), libraryRootId: "root", timestamp: "now" });
      await closed;
      for (let index = 0; index < 20 && data.service.getClientCount(); index += 1) await delay(10);
      assert.equal(data.service.getClientCount(), 0);
    } finally { await data.app.close(); }
  }
});
