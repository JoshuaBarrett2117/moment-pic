import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import sharp from "sharp";

import { rescanAlbum, rescanAlbums, scanLibrary } from "./library-scanner.js";
import { scanCoordinator } from "./scan-coordinator.js";
import { deleteLibraryRootDb, upsertLibraryRootDb } from "../repositories/library-root-repository.js";
import { listAlbumsByLibraryRootIdDb } from "../repositories/album-repository.js";
import { getDb } from "../db/sqlite.js";

const createLibrary = async (albumCount: number) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "scan-concurrency-"));
  for (let index = 0; index < albumCount; index += 1) {
    const folder = path.join(directory, `album-${index}`);
    await fs.promises.mkdir(folder);
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toFile(path.join(folder, "p1.png"));
  }
  const id = path.basename(directory);
  const timestamp = new Date().toISOString();
  upsertLibraryRootDb({ id, path: directory, name: id, enabled: true, lastScannedAt: null, createdAt: timestamp, updatedAt: timestamp });
  return {
    id,
    directory,
    cleanup: async () => {
      deleteLibraryRootDb(id);
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  };
};

const countBySourcePath = (rootId: string) =>
  getDb().prepare("SELECT source_path, COUNT(*) AS n FROM albums WHERE library_root_id = ? GROUP BY source_path").all(rootId) as Array<{ source_path: string; n: number }>;

test("并发触发多次扫描（全量 + 同图库 + 增量重扫）不报错，每个 source_path 只有一条记录", async () => {
  const library = await createLibrary(6);
  try {
    const results = await Promise.allSettled([
      scanLibrary({ libraryRootId: library.id }),
      scanLibrary(),
      scanLibrary({ libraryRootId: library.id }),
      scanLibrary({ libraryRootId: library.id, batchSize: 1 })
    ]);
    for (const result of results) {
      assert.equal(result.status, "fulfilled", result.status === "rejected" ? String(result.reason) : "");
    }
    const rows = countBySourcePath(library.id);
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.n === 1), JSON.stringify(rows));

    // 新增目录后再并发：扫描与重扫交错也不会产生重复记录
    const folder = path.join(library.directory, "album-new");
    await fs.promises.mkdir(folder);
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "green" } }).png().toFile(path.join(folder, "p1.png"));
    const ids = listAlbumsByLibraryRootIdDb(library.id).map((album) => album.id);
    const second = await Promise.allSettled([
      scanLibrary({ libraryRootId: library.id }),
      rescanAlbums(ids),
      scanLibrary({ libraryRootId: library.id }),
      rescanAlbum(ids[0])
    ]);
    assert.ok(second.every((result) => result.status === "fulfilled"));
    const after = countBySourcePath(library.id);
    assert.equal(after.length, 7);
    assert.ok(after.every((row) => row.n === 1));
    assert.equal(scanCoordinator.isBusy(), false);
  } finally {
    await library.cleanup();
  }
});

test("内容未变时重复扫描/单图集重扫不改 updated_at", async () => {
  const library = await createLibrary(3);
  try {
    await scanLibrary({ libraryRootId: library.id });
    const before = new Map(listAlbumsByLibraryRootIdDb(library.id).map((album) => [album.id, album.updatedAt]));
    assert.equal(before.size, 3);
    await delay(15);

    await scanLibrary({ libraryRootId: library.id });
    await scanLibrary();
    const target = [...before.keys()][0];
    await rescanAlbum(target);
    await rescanAlbums([...before.keys()]);

    // 仅目录 mtime 变化（例如 touch），内容不变：同样不刷新 updated_at
    const touched = listAlbumsByLibraryRootIdDb(library.id)[0];
    const future = new Date(Date.now() + 60_000);
    await fs.promises.utimes(touched.sourcePath, future, future);
    await scanLibrary({ libraryRootId: library.id });

    for (const album of listAlbumsByLibraryRootIdDb(library.id)) {
      assert.equal(album.updatedAt, before.get(album.id), `${album.name} 的 updated_at 被误刷新`);
    }

    // 对照：内容真的变化时 updated_at 会前进
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toFile(path.join(touched.sourcePath, "p2.png"));
    await scanLibrary({ libraryRootId: library.id });
    const changed = listAlbumsByLibraryRootIdDb(library.id).find((album) => album.id === touched.id);
    assert.ok(changed && changed.updatedAt > (before.get(touched.id) ?? ""), "内容变化应刷新 updated_at");
    assert.equal(changed?.assetCount, 2);
  } finally {
    await library.cleanup();
  }
});

test("扫描协调器：串行执行、失败不阻塞后续、drain 等待全部完成", async () => {
  const order: string[] = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const job = (label: string, fail = false) => scanCoordinator.runExclusive(label, async () => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    order.push(`start:${label}`);
    await delay(5);
    order.push(`end:${label}`);
    concurrent -= 1;
    if (fail) throw new Error(label);
    return label;
  });
  const results = await Promise.allSettled([job("a"), job("b", true), job("c")]);
  await scanCoordinator.drain();
  assert.equal(maxConcurrent, 1);
  assert.deepEqual(order, ["start:a", "end:a", "start:b", "end:b", "start:c", "end:c"]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected", "fulfilled"]);
  assert.equal(scanCoordinator.isBusy(), false);
});
