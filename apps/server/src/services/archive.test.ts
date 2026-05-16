import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import test from "node:test";

import { path7za } from "7zip-bin";
import sharp from "sharp";

import {
  detectArchiveType,
  isArchiveFile,
  listRootImageEntries,
  openArchiveEntryBody,
  readArchiveEntryBuffer
} from "./archive.js";

const testArchiveRoots = (process.env.MOMENT_PIC_REAL_ARCHIVE_ROOTS ?? "")
  .split(/[;\r\n]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const findRealArchive = async (pattern: RegExp): Promise<string | null> => {
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

  return null;
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

const readBody = async (body: Buffer | Readable): Promise<Buffer> => {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

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

const create7zFixture = async (): Promise<{ archivePath: string; tempDir: string }> => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-archive-7z-"));
  const archivePath = path.join(tempDir, "sample.7z");
  const pagesDir = path.join(tempDir, "pages");
  await fs.promises.mkdir(pagesDir, { recursive: true });
  await fs.promises.writeFile(path.join(pagesDir, "page-01.jpg"), Buffer.alloc(1024, 0x33));
  await run7z(["a", "-t7z", archivePath, "pages/page-01.jpg"], tempDir);
  return { archivePath, tempDir };
};

const createCbrExtractionFixture = async (): Promise<{
  archivePath: string;
  tempDir: string;
  entryPath: string;
  content: Buffer;
}> => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-archive-cbr-7z-"));
  const archivePath = path.join(tempDir, "sample.cbr");
  const entryPath = "pages/page-01.jpg";
  const entryFullPath = path.join(tempDir, entryPath);
  const content = Buffer.from("cbr-entry-content-through-7z", "utf8");

  await fs.promises.mkdir(path.dirname(entryFullPath), { recursive: true });
  await fs.promises.writeFile(entryFullPath, content);
  await run7z(["a", "-tzip", archivePath, entryPath], tempDir);

  return { archivePath, tempDir, entryPath, content };
};

const createLargeZipFixture = async (): Promise<{ archivePath: string; tempDir: string; entryPath: string }> => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-archive-large-jpeg-"));
  const entryPath = "pages/large.jpg";
  const entryFullPath = path.join(tempDir, entryPath);
  const archivePath = path.join(tempDir, "large.zip");
  await fs.promises.mkdir(path.dirname(entryFullPath), { recursive: true });
  const imageBuffer = await sharp({
    create: {
      width: 1200,
      height: 1800,
      channels: 3,
      background: { r: 40, g: 80, b: 120 }
    }
  }).jpeg({ quality: 90 }).toBuffer();
  await fs.promises.writeFile(entryFullPath, imageBuffer);
  await run7z(["a", "-tzip", archivePath, entryPath], tempDir);
  return { archivePath, tempDir, entryPath };
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

test("listRootImageEntries reads a real cbr archive through unrar when integration fixtures are configured", async (t) => {
  const archivePath = await findRealArchive(/Gold Photobook/i);
  if (!archivePath) {
    t.skip("MOMENT_PIC_REAL_ARCHIVE_ROOTS 未配置，跳过真实 CBR 集成测试");
    return;
  }

  const entries = await listRootImageEntries(archivePath);

  assert.equal(entries.length, 110);
  assert.equal(entries[0]?.entryPath.startsWith("KenKen"), true);
  assert.equal(entries[0]?.extension, "jpg");
});

test("readArchiveEntryBuffer reads a real cbr entry through 7z extraction when integration fixtures are configured", async (t) => {
  const archivePath = await findRealArchive(/Silver Photobook/i);
  if (!archivePath) {
    t.skip("MOMENT_PIC_REAL_ARCHIVE_ROOTS 未配置，跳过真实 CBR 读取集成测试");
    return;
  }

  const entries = await listRootImageEntries(archivePath);
  const buffer = await readArchiveEntryBuffer(archivePath, entries[0]!.entryPath);

  assert.equal(buffer.length > 0, true);
});

test("listRootImageEntries reads a large real cbr archive through unrar when integration fixtures are configured", async (t) => {
  const archivePath = await findRealArchive(/Bangni/i);
  if (!archivePath) {
    t.skip("MOMENT_PIC_REAL_ARCHIVE_ROOTS 未配置，跳过真实 CBR 集成测试");
    return;
  }

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

test("listRootImageEntries reads generated 7z fixtures", async () => {
  const { archivePath, tempDir } = await create7zFixture();
  try {
    const entries = await listRootImageEntries(archivePath);

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.entryPath, "pages/page-01.jpg");
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("readArchiveEntryBuffer reads cbr entries through 7z extraction", async () => {
  const { archivePath, tempDir, entryPath, content } = await createCbrExtractionFixture();
  try {
    const buffer = await readArchiveEntryBuffer(archivePath, entryPath);

    assert.deepEqual(buffer, content);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("openArchiveEntryBody streams cbr entries through 7z extraction", async () => {
  const { archivePath, tempDir, entryPath, content } = await createCbrExtractionFixture();
  try {
    const body = await openArchiveEntryBody(archivePath, entryPath);

    assert.deepEqual(await readBody(body), content);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("readArchiveEntryBuffer preserves generated ZIP JPEG dimensions", async () => {
  const { archivePath, tempDir, entryPath } = await createLargeZipFixture();
  try {
    const buffer = await readArchiveEntryBuffer(archivePath, entryPath);
    const metadata = await sharp(buffer, { animated: true }).metadata();

    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1800);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});
