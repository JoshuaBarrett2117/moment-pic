import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { listDirectoryAlbumNodesFromRecords } from "./directory-album-service.js";
import type { AlbumRecord, LibraryRootRecord } from "../types/store.js";

const makeRoot = (rootPath: string): LibraryRootRecord => ({
  id: "root_test",
  name: "测试图库",
  path: rootPath,
  enabled: true,
  lastScannedAt: null,
  createdAt: "2026-05-09T00:00:00.000Z",
  updatedAt: "2026-05-09T00:00:00.000Z"
});

const makeAlbum = (input: {
  id: string;
  root: LibraryRootRecord;
  sourcePath: string;
  name: string;
}): AlbumRecord => ({
  id: input.id,
  libraryRootId: input.root.id,
  name: input.name,
  sourceType: "folder",
  sourcePath: input.sourcePath,
  sourceMtime: "1",
  assetsFingerprint: "fingerprint",
  coverAssetId: null,
  assetCount: 2,
  scanStatus: "ready",
  errorMessage: null,
  createdAt: "2026-05-09T00:00:00.000Z",
  updatedAt: "2026-05-09T00:00:00.000Z"
});

test("directory album tree enters scanned child folders as albums and keeps containers as directories", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moment-pic-directory-album-"));
  try {
    const root = makeRoot(tempDir);
    const albumPath = path.join(tempDir, "图集A");
    const containerPath = path.join(tempDir, "系列");
    const nestedAlbumPath = path.join(containerPath, "图集B");

    await fs.promises.mkdir(albumPath, { recursive: true });
    await fs.promises.mkdir(nestedAlbumPath, { recursive: true });
    await fs.promises.writeFile(path.join(albumPath, "001.jpg"), "test");
    await fs.promises.writeFile(path.join(nestedAlbumPath, "001.jpg"), "test");

    const nodes = await listDirectoryAlbumNodesFromRecords(root, tempDir, [
      makeAlbum({ id: "alb_a", root, sourcePath: albumPath, name: "图集A" }),
      makeAlbum({ id: "alb_b", root, sourcePath: nestedAlbumPath, name: "图集B" })
    ]);

    const containerNode = nodes.find((node) => node.name === "系列");
    const albumNode = nodes.find((node) => node.name === "图集A");

    assert.equal(nodes.length, 2);
    assert.equal(containerNode?.kind, "directory");
    assert.equal(containerNode?.childCount, 1);
    assert.equal(albumNode?.kind, "album");
    assert.equal(albumNode?.albumId, "alb_a");
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});
