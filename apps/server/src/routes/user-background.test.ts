import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { buildApp } from "../app.js";
import { env } from "../config/env.js";
import { findFirstAdminDb } from "../repositories/user-repository.js";
import { removeUserBackground } from "../services/user-background-service.js";
import { testSessionCookie } from "../test-support/session.js";

const URL_PATH = "/api/v1/account/background";
const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 80, b: 120 } } }).png().toBuffer();

test("自定义背景：鉴权、上传转 WebP、缓存头、304、删除", async () => {
  const app = buildApp();
  const headers = { cookie: testSessionCookie(60_000) };
  const adminId = findFirstAdminDb()!.id;
  await removeUserBackground(adminId);
  try {
    assert.equal((await app.inject({ url: URL_PATH })).statusCode, 401);
    assert.equal((await app.inject({ url: `${URL_PATH}/meta`, headers })).json().data, null);
    assert.equal((await app.inject({ url: URL_PATH, headers })).statusCode, 404);

    const upload = await app.inject({
      method: "PUT", url: URL_PATH, headers: { ...headers, "content-type": "image/png" }, payload: await png(3200, 1800)
    });
    assert.equal(upload.statusCode, 200, upload.body);
    const data = upload.json().data;
    assert.equal(data.width, 2560);
    assert.equal(data.height, 1440);
    assert.match(data.url, /^\/api\/v1\/account\/background\?v=[0-9a-f]{12}$/);

    const meta = await app.inject({ url: `${URL_PATH}/meta`, headers });
    assert.equal(meta.json().data.version, data.version);

    const image = await app.inject({ url: data.url, headers });
    assert.equal(image.statusCode, 200);
    assert.equal(image.headers["content-type"], "image/webp");
    assert.match(String(image.headers["cache-control"]), /immutable/);
    const etag = String(image.headers.etag);
    assert.equal((await app.inject({ url: data.url, headers: { ...headers, "if-none-match": etag } })).statusCode, 304);
    assert.equal((await sharp(image.rawPayload).metadata()).format, "webp");

    const removed = await app.inject({ method: "DELETE", url: URL_PATH, headers });
    assert.equal(removed.json().data.removed, true);
    assert.equal((await app.inject({ url: URL_PATH, headers })).statusCode, 404);
  } finally {
    await removeUserBackground(adminId);
    await app.close();
  }
});

test("自定义背景：拒绝非图片、过小图片与不支持的类型", async () => {
  const app = buildApp();
  const headers = { cookie: testSessionCookie(60_000) };
  try {
    const garbage = await app.inject({ method: "PUT", url: URL_PATH, headers: { ...headers, "content-type": "image/jpeg" }, payload: Buffer.from("not an image") });
    assert.equal(garbage.statusCode, 400);
    const tiny = await app.inject({ method: "PUT", url: URL_PATH, headers: { ...headers, "content-type": "image/png" }, payload: await png(200, 120) });
    assert.equal(tiny.statusCode, 400);
    assert.match(tiny.json().message, /太小/);
    const gif = await app.inject({ method: "PUT", url: URL_PATH, headers: { ...headers, "content-type": "image/gif" }, payload: Buffer.from("GIF89a") });
    assert.equal(gif.statusCode, 415);
    assert.ok(env.sqlitePath);
  } finally {
    await app.close();
  }
});
