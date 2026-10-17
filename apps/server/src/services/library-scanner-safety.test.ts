import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { path7za } from "7zip-bin";
import { rescanAlbum, scanLibrary } from "./library-scanner.js";
import { buildCacheKey } from "./thumbnail-options.js";
import { upsertLibraryRootDb, deleteLibraryRootDb } from "../repositories/library-root-repository.js";
import { listAlbumsByLibraryRootIdDb, listAssetsByAlbumIdDb, findAlbumByIdDb, updateAlbumFavoriteDb, insertAlbumShareDb, findAlbumShareByTokenDb } from "../repositories/album-repository.js";

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

test("Sharp 不支持的有效 BMP 可索引，支持格式损坏仍报失败", async () => {
  const data = await fixture();
  try {
    const bitmap = Buffer.alloc(58);
    bitmap.write("BM");
    bitmap.writeUInt32LE(58, 2);
    bitmap.writeUInt32LE(54, 10);
    bitmap.writeUInt32LE(40, 14);
    bitmap.writeInt32LE(1, 18);
    bitmap.writeInt32LE(1, 22);
    bitmap.writeUInt16LE(1, 26);
    bitmap.writeUInt16LE(24, 28);
    bitmap.writeUInt32LE(4, 34);
    await fs.promises.writeFile(path.join(data.folder, "supported.bmp"), bitmap);
    assert.equal((await scanLibrary({ libraryRootId: data.id })).failureCount, 0);
    const images = listAssetsByAlbumIdDb(data.album.id);
    assert.equal(images.length, 2);
    assert.equal(images.find((asset) => asset.extension === "png")?.width, 16);
    await fs.promises.writeFile(data.image, "damaged supported PNG");
    assert.ok((await scanLibrary({ libraryRootId: data.id })).failureCount > 0);
    assert.equal(listAssetsByAlbumIdDb(data.album.id).length, 2);
  } finally { await data.cleanup(); }
});

test("无关文件的断链不影响文件夹或归档扫描，相关图片/归档断链仍保留失败状态", async () => {
  const data = await fixture();
  try {
    await fs.promises.symlink(path.join(data.directory, "missing"), path.join(data.folder, "notes.txt"));
    assert.equal((await scanLibrary({ libraryRootId: data.id })).failureCount, 0);
    for (const name of ["missing.png", "missing.zip"]) {
      const link = path.join(data.folder, name);
      await fs.promises.symlink(path.join(data.directory, "missing"), link);
      assert.ok((await scanLibrary({ libraryRootId: data.id })).failureCount > 0);
      assert.ok(findAlbumByIdDb(data.album.id));
      await fs.promises.unlink(link);
    }
  } finally { await data.cleanup(); }
});

test("全量替换、失败恢复与单相册重扫保持收藏和分享，确认删除才清理分享", async () => {
  const data = await fixture();
  const token = `${data.id}-share`;
  try {
    updateAlbumFavoriteDb(data.album.id, true, new Date().toISOString());
    insertAlbumShareDb({ id: token, albumId: data.album.id, token, passwordHash: "0".repeat(32) + ":" + "0".repeat(128), expiresAt: new Date(Date.now() + 3600_000).toISOString(), createdAt: new Date().toISOString() });
    await fs.promises.copyFile(data.image, path.join(data.folder, "second.png"));
    await scanLibrary({ libraryRootId: data.id });
    assert.equal(findAlbumByIdDb(data.album.id)?.isFavorite, true);
    assert.ok(findAlbumShareByTokenDb(token));
    const valid = await fs.promises.readFile(data.image);
    await fs.promises.writeFile(data.image, "broken");
    await scanLibrary({ libraryRootId: data.id });
    assert.equal(findAlbumByIdDb(data.album.id)?.isFavorite, true);
    assert.ok(findAlbumShareByTokenDb(token));
    await fs.promises.writeFile(data.image, valid);
    await rescanAlbum(data.album.id);
    assert.equal(findAlbumByIdDb(data.album.id)?.isFavorite, true);
    assert.ok(findAlbumShareByTokenDb(token));
    await fs.promises.rm(data.folder, { recursive: true });
    await scanLibrary({ libraryRootId: data.id });
    assert.equal(findAlbumByIdDb(data.album.id), null);
    assert.equal(findAlbumShareByTokenDb(token), null);
  } finally { await data.cleanup(); }
});

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

test("连续扫描未变更图集：第二次 sharp.metadata 与 ZIP 打开次数均为零", async (context) => {
  const data = await fixture();
  const { default: yauzl } = await import("yauzl");
  try {
    const archive = path.join(data.directory, "unchanged.zip");
    assert.equal(spawnSync(path7za, ["a", "-tzip", archive, data.image]).status, 0);
    await scanLibrary({ libraryRootId: data.id });
    const metadata = context.mock.method(sharp.prototype, "metadata");
    const open = context.mock.method(yauzl, "open");
    const result = await scanLibrary({ libraryRootId: data.id });
    assert.equal(metadata.mock.callCount(), 0);
    assert.equal(open.mock.callCount(), 0);
    assert.equal(result.assetsDiscovered, 2);
    assert.equal(listAssetsByAlbumIdDb(data.album.id)[0].width, 16);
    await fs.promises.utimes(archive, new Date(), new Date(Date.now() + 4000));
    await scanLibrary({ libraryRootId: data.id });
    assert.ok(open.mock.callCount() > 0);
  } finally { context.mock.restoreAll(); await data.cleanup(); }
});

test("定向批量重扫删除空图集和消失的目录，单图失败保留旧索引且不阻断其他图集", async () => {
  const { rescanAlbums } = await import("./library-scanner.js");
  const data = await fixture();
  try {
    const otherFolder = path.join(data.directory, "other");
    await fs.promises.mkdir(otherFolder);
    await fs.promises.copyFile(data.image, path.join(otherFolder, "page.png"));
    await scanLibrary({ libraryRootId: data.id });
    const other = listAlbumsByLibraryRootIdDb(data.id).find((album) => album.sourcePath === otherFolder)!;
    await fs.promises.writeFile(data.image, "broken");
    await fs.promises.rm(otherFolder, { recursive: true });
    assert.deepEqual(await rescanAlbums([data.album.id, other.id]), { rescanned: 0, removed: 1, failed: 1 });
    assert.equal(findAlbumByIdDb(other.id), null);
    assert.equal(findAlbumByIdDb(data.album.id)?.scanStatus, "error");
    assert.equal(listAssetsByAlbumIdDb(data.album.id).length, 1);
    await fs.promises.rm(data.image);
    assert.deepEqual(await rescanAlbums([data.album.id]), { rescanned: 0, removed: 1, failed: 0 });
    assert.equal(findAlbumByIdDb(data.album.id), null);
  } finally { await data.cleanup(); }
});

test("新 ZIP 扫描填尺寸，旧 NULL 仅按当页回填且失败不写库、不改缩略图键", async () => {
  const { getDb } = await import("../db/sqlite.js");
  const { getAlbumAssets } = await import("./album-service.js");
  const data = await fixture();
  try {
    const archive = path.join(data.directory, "dimension.zip");
    await fs.promises.copyFile(data.image, path.join(data.folder, "second.png"));
    await fs.promises.writeFile(path.join(data.folder, "bad.jpg"), "broken header");
    assert.equal(spawnSync(path7za, ["a", "-tzip", archive, path.join(data.folder, "*.png"), path.join(data.folder, "bad.jpg")]).status, 0);
    await scanLibrary({ libraryRootId: data.id });
    const album = listAlbumsByLibraryRootIdDb(data.id).find((item) => item.sourcePath === archive)!;
    assert.ok(album);
    const images = listAssetsByAlbumIdDb(album.id);
    assert.equal(images.find((item) => item.name === "page.png")?.width, 16);
    getDb().prepare("UPDATE assets SET width=NULL, height=NULL, thumbnail_key='keep-key' WHERE album_id=?").run(album.id);
    const page = await getAlbumAssets(album.id, 2, 1);
    assert.equal(page?.items[0].width, 16);
    const after = listAssetsByAlbumIdDb(album.id);
    assert.equal(after.filter((item) => item.width !== null).length, 1);
    assert.ok(after.every((item) => item.thumbnailKey === "keep-key"));
    const bad = await getAlbumAssets(album.id, 1, 1);
    assert.equal(bad?.items[0].width, null);
    const plan = getDb().prepare("EXPLAIN QUERY PLAN SELECT * FROM assets WHERE album_id=? ORDER BY sort_index LIMIT 1").all(album.id);
    assert.ok(JSON.stringify(plan).includes("idx_assets_album_sort"));
  } finally { await data.cleanup(); }
});
