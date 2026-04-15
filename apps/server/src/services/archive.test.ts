import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { detectArchiveType, isArchiveFile } from "./archive.js";

test("detectArchiveType recognizes rar archives as cbr", () => {
  assert.equal(detectArchiveType("gallery.rar"), "cbr");
  assert.equal(detectArchiveType("gallery.cbr"), "cbr");
  assert.equal(detectArchiveType("gallery.cbz"), "zip");
  assert.equal(detectArchiveType("gallery.7z"), "7z");
  assert.equal(detectArchiveType("gallery.txt"), null);
});

test("isArchiveFile accepts rar archives", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-archive-"));
  const rarPath = path.join(tempDir, "sample.rar");
  const txtPath = path.join(tempDir, "sample.txt");

  try {
    await fs.promises.writeFile(rarPath, "");
    await fs.promises.writeFile(txtPath, "");

    assert.equal(await isArchiveFile(rarPath), true);
    assert.equal(await isArchiveFile(txtPath), false);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});
