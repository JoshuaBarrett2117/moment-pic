import assert from "node:assert/strict";
import test from "node:test";

import { detectArchiveType, extractJpegFromPsd, findEmbeddedJpegInPsd, normalizeArchiveEntryPath, PSD_MAGIC, SUPPORTED_ARCHIVE_EXTENSIONS } from "./archive-utils.js";

test("archive utils detect supported archive types", () => {
  assert.equal(detectArchiveType("gallery.rar"), "cbr");
  assert.equal(detectArchiveType("gallery.cbr"), "cbr");
  assert.equal(detectArchiveType("gallery.cbz"), "zip");
  assert.equal(detectArchiveType("gallery.7z"), "7z");
  assert.equal(detectArchiveType("gallery.txt"), null);
  assert.equal(SUPPORTED_ARCHIVE_EXTENSIONS.has("rar"), true);
});

test("normalizeArchiveEntryPath converts windows separators to archive separators", () => {
  assert.equal(normalizeArchiveEntryPath("pages\\nested\\01.jpg"), "pages/nested/01.jpg");
});

test("PSD JPEG helpers extract embedded jpeg payloads and leave non-PSD buffers unchanged", () => {
  const jpegPayload = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    Buffer.alloc(120, 0x11),
    Buffer.from([0xff, 0xd9])
  ]);
  const psdBuffer = Buffer.concat([PSD_MAGIC, Buffer.alloc(16, 0), jpegPayload, Buffer.alloc(8, 0)]);

  assert.deepEqual(findEmbeddedJpegInPsd(psdBuffer), jpegPayload);
  assert.deepEqual(extractJpegFromPsd(psdBuffer), jpegPayload);
  assert.deepEqual(extractJpegFromPsd(Buffer.from("not-a-psd")), Buffer.from("not-a-psd"));
});
