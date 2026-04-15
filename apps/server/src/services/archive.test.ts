import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { detectArchiveType, isArchiveFile, listRootImageEntries, readArchiveEntryBuffer } from "./archive.js";

const testArchiveRoot = "C:/Users/a3875/Pictures/test2";

const getRealArchive = async (pattern: RegExp): Promise<string> => {
  const entries = await fs.promises.readdir(testArchiveRoot);
  const match = entries.find((name) => pattern.test(name));
  if (!match) {
    throw new Error(`test archive not found for pattern: ${pattern}`);
  }

  return path.join(testArchiveRoot, match);
};

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

test("listRootImageEntries reads a real cbr archive through unrar", async () => {
  const archivePath = await getRealArchive(/Gold Photobook/i);
  const entries = await listRootImageEntries(archivePath);

  assert.equal(entries.length, 110);
  assert.equal(entries[0]?.entryPath.startsWith("KenKen"), true);
  assert.equal(entries[0]?.extension, "jpg");
});

test("readArchiveEntryBuffer reads a real cbr entry through unrar", async () => {
  const archivePath = await getRealArchive(/Silver Photobook/i);
  const entries = await listRootImageEntries(archivePath);
  const buffer = await readArchiveEntryBuffer(archivePath, entries[0]!.entryPath);

  assert.equal(buffer.length > 0, true);
});

test("listRootImageEntries reads a large real cbr archive through unrar", async () => {
  const archivePath = await getRealArchive(/Bangni/i);
  const entries = await listRootImageEntries(archivePath);

  assert.equal(entries.length, 81);
  assert.equal(entries[0]?.entryPath.startsWith("Bangni"), true);
});
