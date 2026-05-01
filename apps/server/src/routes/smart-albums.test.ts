import assert from "node:assert/strict";
import crypto from "node:crypto";
import Fastify from "fastify";
import test from "node:test";

import { smartAlbumRoutes } from "./smart-albums.js";
import type { AlbumRecord, AssetRecord, SmartAlbumRuleRecord } from "../types/store.js";
import { insertAlbumWithAssetsDb, makeId, upsertLibraryRootDb, upsertSmartAlbumRuleDb } from "../services/sqlite-store.js";

const createAssetRecord = (overrides: Partial<AssetRecord>): AssetRecord => ({
  id: `ast_${crypto.randomUUID().replace(/-/g, "")}`,
  albumId: `alb_${crypto.randomUUID().replace(/-/g, "")}`,
  name: "sample.jpg",
  extension: "jpg",
  sourceType: "folder",
  sourcePath: "",
  relativePath: null,
  zipEntryPath: null,
  sortIndex: 1,
  width: null,
  height: null,
  sizeBytes: "1234",
  sourceMtime: null,
  thumbnailKey: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

const seedAlbum = (input: { libraryRootId: string; sourcePath: string; name: string }): AlbumRecord => {
  const timestamp = new Date().toISOString();
  const albumId = `alb_${crypto.randomUUID().replace(/-/g, "")}`;
  const asset = createAssetRecord({
    albumId,
    sourcePath: `${input.sourcePath}/001.jpg`
  });
  const album: AlbumRecord = {
    id: albumId,
    libraryRootId: input.libraryRootId,
    name: input.name,
    sourceType: "folder",
    sourcePath: input.sourcePath,
    sourceMtime: null,
    assetsFingerprint: null,
    coverAssetId: asset.id,
    assetCount: 1,
    scanStatus: "ready",
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  insertAlbumWithAssetsDb(album, [asset]);
  return album;
};

test("smart album routes rebuild grouped albums from rules", async () => {
  const app = Fastify();
  const suffix = crypto.randomUUID().replace(/-/g, "");
  const libraryRootId = `root_${suffix}`;
  const timestamp = new Date().toISOString();
  const token = `author-${suffix}`;
  const ruleId = makeId("sar");

  upsertLibraryRootDb({
    id: libraryRootId,
    name: `smart-root-${suffix}`,
    path: `C:/smart-test/${suffix}`,
    enabled: true,
    lastScannedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  const firstAlbum = seedAlbum({
    libraryRootId,
    sourcePath: `C:/smart-test/${suffix}/set-1`,
    name: `${token} NO.001`
  });
  seedAlbum({
    libraryRootId,
    sourcePath: `C:/smart-test/${suffix}/set-2`,
    name: `${token} NO.002`
  });
  seedAlbum({
    libraryRootId,
    sourcePath: `C:/smart-test/${suffix}/other`,
    name: `other-${suffix}`
  });

  const rule: SmartAlbumRuleRecord = {
    id: ruleId,
    name: `rule-${suffix}`,
    enabled: true,
    priority: 200,
    scope: "albumName",
    matchMode: "contains",
    patternsJson: JSON.stringify([token]),
    normalizeOptionsJson: JSON.stringify({
      trimSpaces: true,
      normalizeCase: true,
      stripSequenceNo: true,
      stripDate: true,
      stripPageStats: true,
      stripSizeStats: true
    }),
    action: "assignSmartAlbum",
    targetName: token,
    targetNameTemplate: null,
    minAlbumCount: 2,
    minConfidence: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  upsertSmartAlbumRuleDb(rule);

  try {
    await app.register(smartAlbumRoutes);
    await app.ready();

    const rebuildResponse = await app.inject({
      method: "POST",
      url: "/api/v1/smart-albums/rebuild"
    });
    assert.equal(rebuildResponse.statusCode, 200);
    const rebuildPayload = rebuildResponse.json() as {
      data: { taskId: string; status: "pending" | "running" | "completed" | "failed" };
    };
    assert.equal(Boolean(rebuildPayload.data.taskId), true);

    let rebuildStatusPayload:
      | {
          data: {
            taskId: string;
            status: "pending" | "running" | "completed" | "failed";
            error: string | null;
            result: { smartAlbumsDiscovered: number; membersDiscovered: number } | null;
          };
        }
      | undefined;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const statusResponse = await app.inject({
        method: "GET",
        url: `/api/v1/smart-albums/rebuild/${rebuildPayload.data.taskId}`
      });
      assert.equal(statusResponse.statusCode, 200);
      rebuildStatusPayload = statusResponse.json();
      if (rebuildStatusPayload?.data.status === "completed" || rebuildStatusPayload?.data.status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.equal(rebuildStatusPayload?.data.status, "completed");
    assert.equal((rebuildStatusPayload?.data.result?.smartAlbumsDiscovered ?? 0) >= 1, true);
    assert.equal((rebuildStatusPayload?.data.result?.membersDiscovered ?? 0) >= 2, true);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/v1/smart-albums?keyword=${encodeURIComponent(token)}`
    });
    assert.equal(listResponse.statusCode, 200);
    const listPayload = listResponse.json() as {
      data: { items: Array<{ id: string; name: string; albumCount: number }> };
    };
    assert.equal(listPayload.data.items.length, 1);
    assert.equal(listPayload.data.items[0]?.name, token);
    assert.equal(listPayload.data.items[0]?.albumCount, 2);

    const smartAlbumId = listPayload.data.items[0]!.id;
    const membersResponse = await app.inject({
      method: "GET",
      url: `/api/v1/smart-albums/${smartAlbumId}/albums`
    });
    assert.equal(membersResponse.statusCode, 200);
    const membersPayload = membersResponse.json() as {
      data: { items: Array<{ albumId: string }> };
    };
    assert.deepEqual(
      membersPayload.data.items.map((item) => item.albumId).includes(firstAlbum.id),
      true
    );
    assert.equal(membersPayload.data.items.length, 2);

    const testRuleResponse = await app.inject({
      method: "POST",
      url: `/api/v1/smart-album-rules/${ruleId}/test`
    });
    assert.equal(testRuleResponse.statusCode, 200);
    const testRulePayload = testRuleResponse.json() as {
      data: { matchedAlbums: Array<{ name: string }> };
    };
    assert.equal(testRulePayload.data.matchedAlbums.length, 2);
  } finally {
    await app.close();
  }
});
