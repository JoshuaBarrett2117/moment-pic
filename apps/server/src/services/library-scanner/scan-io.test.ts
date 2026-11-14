import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { path7za } from "7zip-bin";
import yauzl from "yauzl";
import { scanLibrary } from "../library-scanner.js";
import { ExistingAssetIndex } from "./album-discovery.js";
import { HeaderDimensions } from "../thumbnail/header-dimensions.js";
import { readZipHeads } from "../archive/zip-reader.js";
import { deleteLibraryRootDb, upsertLibraryRootDb } from "../../repositories/library-root-repository.js";
import { listAlbumsByLibraryRootIdDb, listAssetsByAlbumIdDb } from "../../repositories/album-repository.js";

const png = (file: string, width = 16, height = 24) =>
  sharp({ create: { width, height, channels: 3, background: "red" } }).png().toFile(file);

const makeZip = (cwd: string, archive: string, files: string[]) =>
  assert.equal(spawnSync(path7za, ["a", "-tzip", archive, ...files], { cwd }).status, 0);

const registerRoot = (directory: string) => {
  const id = path.basename(directory);
  const timestamp = new Date().toISOString();
  upsertLibraryRootDb({ id, path: directory, name: id, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  return id;
};

test("全量扫描单次遍历：每个目录只 readdir 一次，同时产出目录图集与归档图集", async (context) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scan-single-pass-"));
  const id = registerRoot(root);
  try {
    await fs.promises.mkdir(path.join(root, "a", "b"), { recursive: true });
    await png(path.join(root, "a", "1.png"));
    await png(path.join(root, "a", "b", "2.png"));
    const staging = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scan-zip-src-"));
    await png(path.join(staging, "p1.png"));
    await png(path.join(staging, "p2.png"), 30, 10);
    makeZip(staging, path.join(root, "a", "b", "book.zip"), ["p1.png", "p2.png"]);
    makeZip(staging, path.join(root, "top.cbz"), ["p1.png"]);
    await fs.promises.rm(staging, { recursive: true, force: true });

    const calls = new Map<string, number>();
    const original = fs.promises.readdir.bind(fs.promises);
    context.mock.method(fs.promises, "readdir", ((target: fs.PathLike, options?: unknown) => {
      calls.set(String(target), (calls.get(String(target)) ?? 0) + 1);
      return (original as (p: fs.PathLike, o?: unknown) => Promise<unknown>)(target, options);
    }) as typeof fs.promises.readdir);

    const result = await scanLibrary({ libraryRootId: id });
    assert.equal(result.failureCount, 0);
    for (const directory of [root, path.join(root, "a"), path.join(root, "a", "b")]) assert.equal(calls.get(directory), 1, directory);
    const albums = listAlbumsByLibraryRootIdDb(id);
    assert.deepEqual(albums.map((album) => `${album.sourceType}:${path.relative(root, album.sourcePath)}`).sort(),
      ["folder:a", "folder:a/b", "zip:a/b/book.zip", "zip:top.cbz"]);
    const book = albums.find((album) => album.name === "book")!;
    assert.deepEqual(listAssetsByAlbumIdDb(book.id).map((asset) => [asset.width, asset.height]), [[16, 24], [30, 10]]);

    // 再扫一次（内容未变）：仍然每个目录只读一次
    calls.clear();
    await scanLibrary({ libraryRootId: id });
    for (const directory of [root, path.join(root, "a"), path.join(root, "a", "b")]) assert.equal(calls.get(directory), 1, directory);
  } finally {
    deleteLibraryRootDb(id);
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("新文件尺寸先读头部：Sharp 无法解码但头部有效的 GIF 也能取到宽高", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scan-header-first-"));
  const id = registerRoot(root);
  try {
    await fs.promises.mkdir(path.join(root, "album"));
    await png(path.join(root, "album", "a.png"));
    const gif = Buffer.alloc(13);
    gif.write("GIF89a");
    gif.writeUInt16LE(37, 6);
    gif.writeUInt16LE(19, 8);
    await fs.promises.writeFile(path.join(root, "album", "b.gif"), gif);
    const result = await scanLibrary({ libraryRootId: id });
    assert.equal(result.failureCount, 0);
    const album = listAlbumsByLibraryRootIdDb(id)[0];
    const assets = listAssetsByAlbumIdDb(album.id);
    assert.deepEqual(assets.map((asset) => [asset.name, asset.width, asset.height]), [["a.png", 16, 24], ["b.gif", 37, 19]]);

    // 整根预加载索引：已有目录图集直接命中，不回退单图集查询
    let fallbackCalls = 0;
    const preloaded = ExistingAssetIndex.forLibraryRoot(id, [album.id]);
    const index = new ExistingAssetIndex(new Map([[album.id, preloaded.get(album.id)]]), () => { fallbackCalls++; return []; });
    assert.equal(index.get(album.id).length, 2);
    assert.equal(index.get("missing").length, 0);
    index.get("missing");
    assert.equal(fallbackCalls, 1);
    index.release(album.id);
    index.get(album.id);
    assert.equal(fallbackCalls, 2);
  } finally {
    deleteLibraryRootDb(id);
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("ZIP 尺寸探测：同一归档多个条目只打开一次、中央目录只读一遍", async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "zip-single-open-"));
  try {
    const names = Array.from({ length: 6 }, (_, i) => `p${i}.png`);
    for (const [i, name] of names.entries()) await png(path.join(directory, name), 10 + i, 20);
    const archive = path.join(directory, "book.zip");
    makeZip(directory, archive, names);
    const original = yauzl.open;
    let opens = 0;
    context.mock.method(yauzl, "open", (...args: Parameters<typeof yauzl.open>) => { opens++; return (original as (...a: unknown[]) => void)(...args); });

    const service = new HeaderDimensions();
    const result = await service.fill(names.map((name) => ({ sourceType: "zip" as const, sourcePath: archive, zipEntryPath: name, sourceMtime: "1", sizeBytes: "1" })));
    assert.equal(opens, 1);
    assert.deepEqual(result, names.map((_, i) => ({ width: 10 + i, height: 20 })));

    const heads = new Map<string, Buffer | null>();
    opens = 0;
    await readZipHeads(archive, ["p5.png", "missing.png", "p0.png"], (entry, head) => heads.set(entry, head));
    assert.equal(opens, 1);
    assert.equal(heads.get("missing.png"), null);
    assert.ok(heads.get("p0.png")!.subarray(1, 4).equals(Buffer.from("PNG")));
    assert.ok(heads.get("p5.png")!.length > 24);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});
