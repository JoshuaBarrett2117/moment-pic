import assert from "node:assert/strict";
import test from "node:test";
import { runIncrementalLibraryScan } from "./incremental-scan.js";
import type { AlbumRecord, LibraryRootRecord } from "../types/store.js";

const root: LibraryRootRecord = { id: "root", path: "/library", name: "root", enabled: true, lastScannedAt: null, createdAt: "", updatedAt: "" };
const album: AlbumRecord = { id: "album", libraryRootId: root.id, sourcePath: "/library/book/", sourceType: "folder", name: "book", sourceMtime: null, assetsFingerprint: null, coverAssetId: null, assetCount: 2, scanStatus: "ready", errorMessage: null, createdAt: "", updatedAt: "" };
const fixture = () => {
  const calls: string[][] = [];
  const full: string[] = [];
  return { calls, full, dependencies: {
    findRoot: () => root, listAlbums: () => [album],
    rescanAlbums: async (ids: string[]) => { calls.push(ids); return { rescanned: ids.length, removed: 0, failed: 0 }; },
    scanLibrary: async (input?: { libraryRootId?: string }) => { full.push(input?.libraryRootId ?? ""); return { albumsDiscovered: 0, assetsDiscovered: 0, failureCount: 0, outcome: "complete", message: null }; }
  } };
};

test("单文件事件只重扫对应图集，同批路径去重且不调 scanLibrary", async () => {
  const f = fixture();
  await runIncrementalLibraryScan(root.id, [{ type: "change", path: "book/page.png" }, { type: "unlink", path: "/library/book/old.png" }], f.dependencies);
  assert.deepEqual(f.calls, [[album.id]]);
  assert.deepEqual(f.full, []);
});

for (const type of ["add", "unlink", "addDir", "unlinkDir"] as const) {
  test(`无法定位的 ${type} 事件回退整根扫描`, async () => {
    const f = fixture();
    await runIncrementalLibraryScan(root.id, [{ type, path: "/library/new/page.png" }], f.dependencies);
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.full, [root.id]);
  });
}

test("目录事件匹配最近祖先，事件集合溢出则回退", async () => {
  const f = fixture();
  await runIncrementalLibraryScan(root.id, [{ type: "unlinkDir", path: "book/nested" }], f.dependencies);
  assert.deepEqual(f.calls, [[album.id]]);
  await runIncrementalLibraryScan(root.id, null, f.dependencies);
  assert.deepEqual(f.full, [root.id]);
});

test("散图目录中的新归档仍回退以发现新图集", async () => {
  const f = fixture();
  await runIncrementalLibraryScan(root.id, [{ type: "add", path: "book/new.zip" }], f.dependencies);
  assert.deepEqual(f.full, [root.id]);
});
