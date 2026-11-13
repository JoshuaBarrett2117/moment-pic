import assert from "node:assert/strict";
import nodeCrypto from "node:crypto";
import test from "node:test";
import sharp from "sharp";

import { normalizeMetadataDimensions, buildCacheKey } from "../thumbnail-options.js";
import { createSharp } from "./sharp-runtime.js";

const makeAnimatedGif = async (frames: number, width: number, height: number) => {
  const frame = (shade: number) =>
    sharp({ create: { width, height, channels: 3, background: { r: shade, g: 40, b: 90 } } }).png().toBuffer();
  const buffers = await Promise.all(Array.from({ length: frames }, (_, index) => frame((index * 25) % 255)));
  return sharp(buffers, { join: { animated: true } }).gif().toBuffer();
};

test("动图：尺寸探测取单帧高度，缩略图只处理第一帧", async () => {
  const gif = await makeAnimatedGif(10, 400, 300);
  assert.deepEqual(normalizeMetadataDimensions(await createSharp(gif).metadata()), { width: 400, height: 300 });
  // 即使按动画读取，pageHeight 也能纠正为单帧高度
  assert.deepEqual(normalizeMetadataDimensions(await createSharp(gif, { animated: true }).metadata()), { width: 400, height: 300 });

  const thumb = await createSharp(gif).resize(120, 120, { fit: "inside" }).webp({ effort: 2 }).toBuffer();
  const meta = await sharp(thumb).metadata();
  assert.equal(meta.width, 120);
  assert.equal(meta.height, 90);
  assert.equal(meta.pages ?? 1, 1);
});

test("动图缩略图缓存键升级版本，普通图片缓存键不变", () => {
  const base = { kind: "thumbnail" as const, zipEntryPath: null, sourceMtime: "1", width: 360, height: 360, format: "webp" as const, quality: 80 };
  const gifKey = buildCacheKey({ ...base, sourcePath: "/a/b.GIF" });
  const jpgKey = buildCacheKey({ ...base, sourcePath: "/a/b.jpg" });
  const gifPreview = buildCacheKey({ ...base, kind: "preview", sourcePath: "/a/b.gif" });
  // 普通图片保持 v5：与旧算法一致
  const legacy = (p: string, kind: string, fit: string) =>
    nodeCrypto.createHash("sha1").update(`${kind}|${p}||1|360x360|webp|q80|fit=${fit}|v5`).digest("hex");
  assert.equal(jpgKey, legacy("/a/b.jpg", "thumbnail", "cover"));
  assert.equal(gifPreview, legacy("/a/b.gif", "preview", "inside"));
  assert.notEqual(gifKey, legacy("/a/b.GIF", "thumbnail", "cover"));
});
