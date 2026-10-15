import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { listRootImageEntries, openArchiveEntryBody, readArchiveEntryBuffer } from "../archive.js";

const fixtures = path.resolve("apps/server/src/services/archive/fixtures");

for (const version of [4, 5]) {
  test(`真实 RAR${version}/CBR 经公共 API 列表、缓冲与流式读取有效 PNG`, async () => {
    const archive = path.join(fixtures, `pixel-rar${version}.cbr`);
    const png = await fs.readFile(path.join(fixtures, "pixel.png"));
    const entries = await listRootImageEntries(archive);
    assert.deepEqual(entries.map((entry) => entry.entryPath), ["pixel.png"]);
    const content = await readArchiveEntryBuffer(archive, "pixel.png");
    assert.deepEqual(content, png);
    assert.equal((await sharp(content).metadata()).format, "png");
    const body = await openArchiveEntryBody(archive, "pixel.png");
    const chunks: Buffer[] = [];
    if (Buffer.isBuffer(body)) chunks.push(body);
    else for await (const chunk of body) chunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(chunks), png);
  });
}
