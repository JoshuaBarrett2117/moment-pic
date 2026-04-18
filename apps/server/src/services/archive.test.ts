import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { path7za } from "7zip-bin";
import sharp from "sharp";

import { detectArchiveType, isArchiveFile, listRootImageEntries, readArchiveEntryBuffer } from "./archive.js";

const testArchiveRoots = ["C:/Users/a3875/Pictures/test2", "C:/Users/a3875/Pictures/test"];

const getRealArchive = async (pattern: RegExp): Promise<string> => {
  for (const root of testArchiveRoots) {
    try {
      const entries = await fs.promises.readdir(root);
      const match = entries.find((name) => pattern.test(name));
      if (match) {
        return path.join(root, match);
      }
    } catch {
      // Continue to the next fixture root.
    }
  }

  throw new Error(`test archive not found for pattern: ${pattern}`);
};

const run7z = async (args: string[], cwd?: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(path7za, args, { windowsHide: true, cwd });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += Buffer.from(chunk).toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`7z failed (${code}): ${stderr}`));
    });
  });

const createMixedZipFixture = async (): Promise<{ archivePath: string; tempDir: string }> => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-archive-root-"));
  const archivePath = path.join(tempDir, "mixed.zip");
  const rootImagePath = path.join(tempDir, "thumb.jpg");
  const nestedDir = path.join(tempDir, "pages");
  const nestedImagePath = path.join(nestedDir, "page-01.jpg");

  await fs.promises.mkdir(nestedDir, { recursive: true });
  await fs.promises.writeFile(rootImagePath, Buffer.alloc(32, 0x11));
  await fs.promises.writeFile(nestedImagePath, Buffer.alloc(2048, 0x22));
  await run7z(["a", "-tzip", archivePath, "thumb.jpg", "pages/page-01.jpg"], tempDir);

  return { archivePath, tempDir };
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

test("listRootImageEntries prefers the larger image set when ZIP has root thumbnails and nested originals", async () => {
  const { archivePath, tempDir } = await createMixedZipFixture();
  try {
    const entries = await listRootImageEntries(archivePath);

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.entryPath, "pages/page-01.jpg");
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("readArchiveEntryBuffer preserves full JPEG dimensions for Photoshop-tagged ZIP entries", async () => {
  const archivePath = await getRealArchive(/海音旋律/i);
  const entryPath = "海音旋律/STM07937.jpg";
  const buffer = await readArchiveEntryBuffer(archivePath, entryPath);
  const metadata = await sharp(buffer, { animated: true }).metadata();

  assert.equal(metadata.width, 4672);
  assert.equal(metadata.height, 7008);
});
