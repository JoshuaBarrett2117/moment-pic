import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { parseImageHeader } from "./image-header-probe.js";

for (const format of ["jpeg", "png", "gif", "webp"] as const) {
  test(`头部探测 ${format} 返回真实图片尺寸`, async () => {
    const data = await sharp({ create: { width: 23, height: 41, channels: 3, background: "red" } }).toFormat(format).toBuffer();
    assert.deepEqual(parseImageHeader(data), { width: 23, height: 41 });
  });
}

test("JPEG EXIF orientation 6 归一化宽高", async () => {
  const data = await sharp({ create: { width: 23, height: 41, channels: 3, background: "blue" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.deepEqual(parseImageHeader(data), { width: 41, height: 23 });
});

for (const marker of [0xc0, 0xc1, 0xc2, 0xc9, 0xca]) {
  test(`JPEG SOF ${marker.toString(16)} 有界解析`, () => {
    assert.deepEqual(parseImageHeader(Buffer.from([0xff, 0xd8, 0xff, marker, 0, 8, 8, 0, 41, 0, 23, 0])), { width: 23, height: 41 });
  });
}

test("BMP 负高度与 OS/2 头部解析", () => {
  const bmp = Buffer.alloc(54);
  bmp.write("BM"); bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(23, 18); bmp.writeInt32LE(-41, 22);
  assert.deepEqual(parseImageHeader(bmp), { width: 23, height: 41 });
  bmp.writeUInt32LE(12, 14); bmp.writeUInt16LE(23, 18); bmp.writeUInt16LE(41, 20);
  assert.deepEqual(parseImageHeader(bmp), { width: 23, height: 41 });
});

for (const kind of ["VP8 ", "VP8L", "VP8X"]) {
  test(`WebP ${kind} 分支解析`, () => {
    const data = Buffer.alloc(30);
    data.write("RIFF"); data.writeUInt32LE(22, 4); data.write("WEBP", 8); data.write(kind, 12); data.writeUInt32LE(10, 16);
    if (kind === "VP8X") { data.writeUIntLE(22, 24, 3); data.writeUIntLE(40, 27, 3); }
    else if (kind === "VP8L") { data[20] = 0x2f; data.writeUInt32LE(22 | (40 << 14), 21); }
    else { data.set([0x9d, 1, 0x2a], 23); data.writeUInt16LE(23, 26); data.writeUInt16LE(41, 28); }
    assert.deepEqual(parseImageHeader(data), { width: 23, height: 41 });
  });
}

test("损坏、截断和 128KB 以后的尺寸不被误识别", () => {
  for (let size = 0; size < 30; size++) assert.equal(parseImageHeader(Buffer.alloc(size)), null);
  assert.equal(parseImageHeader(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])), null);
  const tooLate = Buffer.alloc(140 * 1024);
  tooLate.set([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff], 0);
  assert.equal(parseImageHeader(tooLate), null);
});
