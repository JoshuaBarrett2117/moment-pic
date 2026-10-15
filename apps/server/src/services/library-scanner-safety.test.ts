import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { path7za } from "7zip-bin";
import { scanLibrary } from "./library-scanner.js";
import { buildCacheKey } from "./thumbnail-options.js";
import { upsertLibraryRootDb, deleteLibraryRootDb } from "../repositories/library-root-repository.js";
import { listAlbumsByLibraryRootIdDb, listAssetsByAlbumIdDb, findAlbumByIdDb } from "../repositories/album-repository.js";

const fixture = async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scan-safety-"));
  const folder = path.join(directory, "album");
  await fs.promises.mkdir(folder);
  const image = path.join(folder, "page.png");
  await sharp({ create: { width: 16, height: 24, channels: 3, background: "red" } }).png().toFile(image);
  const id = path.basename(directory);
  const timestamp = new Date().toISOString();
  upsertLibraryRootDb({ id, path: directory, name: id, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  await scanLibrary({ libraryRootId: id });
  const album = listAlbumsByLibraryRootIdDb(id)[0];
  return { id, directory, folder, image, album, cleanup: async () => {
    deleteLibraryRootDb(id);
    await fs.promises.rm(directory, { recursive: true, force: true });
  } };
};

for (const code of ["EIO", "EACCES", "ENOENT"]) {
  test(`根目录 ${code} 不代表确认删除，保留身份与图片并暴露脱敏状态`, async (context) => {
    const data = await fixture();
    try {
      const original = fs.promises.readdir.bind(fs.promises);
      context.mock.method(fs.promises, "readdir", async (...args: Parameters<typeof fs.promises.readdir>) => {
        if (String(args[0]) === data.directory) throw Object.assign(new Error("private mount path"), { code });
        return original(...args);
      });
      const result = await scanLibrary({ libraryRootId: data.id });
      assert.equal(result.outcome, "failed");
      assert.ok(result.failureCount > 0);
      assert.ok(!JSON.stringify(result).includes(data.directory));
      assert.equal(findAlbumByIdDb(data.album.id)?.scanStatus, "error");
      assert.equal(listAssetsByAlbumIdDb(data.album.id).length, 1);
    } finally { context.mock.restoreAll(); await data.cleanup(); }
  });
}

test("单文件 stat 失败不丢失相册和旧图片，其他健康相册仍可更新", async (context) => {
  const data = await fixture();
  try {
    const original = fs.promises.stat.bind(fs.promises);
    context.mock.method(fs.promises, "stat", async (...args: Parameters<typeof fs.promises.stat>) => {
      if (String(args[0]) === data.image) throw Object.assign(new Error("unreadable"), { code: "EACCES" });
      return original(...args);
    });
    const result = await scanLibrary({ libraryRootId: data.id });
    assert.ok(result.failureCount > 0);
    assert.equal(listAssetsByAlbumIdDb(data.album.id).length, 1);
    assert.equal(findAlbumByIdDb(data.album.id)?.scanStatus, "error");
  } finally { context.mock.restoreAll(); await data.cleanup(); }
});

test("图片元数据失败保留旧索引", async () => {
  const data = await fixture();
  try {
    await fs.promises.writeFile(data.image, "damaged image");
    const result = await scanLibrary({ libraryRootId: data.id });
    assert.ok(result.failureCount > 0);
    assert.equal(listAssetsByAlbumIdDb(data.album.id).length, 1);
  } finally { await data.cleanup(); }
});

test("损坏归档保留旧身份；成功枚举确认删除才清理", async () => {
  const data = await fixture();
  try {
    const archive = path.join(data.directory, "book.zip");
    assert.equal(spawnSync(path7za, ["a", "-tzip", archive, data.image]).status, 0);
    await scanLibrary({ libraryRootId: data.id });
    const archived = listAlbumsByLibraryRootIdDb(data.id).find((album) => album.sourceType === "zip")!;
    assert.ok(archived);
    await fs.promises.writeFile(archive, "damaged zip");
    const partial = await scanLibrary({ libraryRootId: data.id });
    assert.equal(partial.outcome, "partial");
    assert.equal(findAlbumByIdDb(archived.id)?.scanStatus, "error");
    await fs.promises.rm(archive);
    await fs.promises.rm(data.folder, { recursive: true });
    const complete = await scanLibrary({ libraryRootId: data.id });
    assert.equal(complete.outcome, "complete");
    assert.equal(listAlbumsByLibraryRootIdDb(data.id).length, 0);
  } finally { await data.cleanup(); }
});

test("目录 mtime 不变时全量扫描验证子文件元数据和集合，更新尺寸和缓存版本", async () => {
  const data = await fixture();
  try {
    const stats = await fs.promises.stat(data.folder);
    const before = listAssetsByAlbumIdDb(data.album.id)[0];
    await sharp({ create: { width: 31, height: 47, channels: 3, background: "blue" } }).png().toFile(data.image);
    await fs.promises.utimes(data.image, new Date(), new Date(Date.now() + 2000));
    await fs.promises.utimes(data.folder, stats.atime, stats.mtime);
    await scanLibrary({ libraryRootId: data.id });
    const after = listAssetsByAlbumIdDb(data.album.id)[0];
    assert.equal(after.id, before.id);
    assert.equal(after.width, 31);
    assert.equal(after.height, 47);
    assert.notEqual(after.sourceMtime, before.sourceMtime);
    const key = (sourceMtime: string | null) => buildCacheKey({ kind: "thumbnail", sourcePath: data.image, zipEntryPath: null, sourceMtime, width: 360, height: 360, format: "jpeg", quality: 80 });
    assert.notEqual(key(before.sourceMtime), key(after.sourceMtime));
    await fs.promises.copyFile(data.image, path.join(data.folder, "second.png"));
    await fs.promises.utimes(data.folder, stats.atime, stats.mtime);
    await scanLibrary({ libraryRootId: data.id });
    assert.equal(listAssetsByAlbumIdDb(data.album.id).length, 2);
    await fs.promises.rm(data.image);
    await fs.promises.utimes(data.folder, stats.atime, stats.mtime);
    await scanLibrary({ libraryRootId: data.id });
    assert.equal(listAssetsByAlbumIdDb(data.album.id).length, 1);
  } finally { await data.cleanup(); }
});
