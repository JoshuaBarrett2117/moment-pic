import assert from "node:assert/strict";
import crypto from "node:crypto";
import Fastify from "fastify";
import test from "node:test";

import { smartAlbumRoutes } from "./smart-albums.js";
import type { AlbumRecord, AssetRecord, SmartAlbumRuleRecord } from "../types/store.js";
import { clearLibraryCatalogDb, clearSmartAlbumDataDb, insertAlbumWithAssetsDb, makeId, upsertLibraryRootDb, upsertSmartAlbumRuleDb } from "../services/sqlite-store.js";
import { rebuildSmartAlbums, updateSmartAlbumAiConfig } from "../services/smart-album-service.js";

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
    sourceEngine: "manual",
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
    generatedNormalizedKey: null,
    generatedConfidence: null,
    generatedReason: null,
    generatedRunId: null,
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
    assert.equal(typeof rebuildPayload.data.taskId, "string");

    type RebuildStatusPayload = {
      data: {
        status: "pending" | "running" | "completed" | "failed";
        result: { smartAlbumsDiscovered: number; membersDiscovered: number } | null;
      };
    };

    let rebuildStatusPayload: RebuildStatusPayload | null = null;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const rebuildStatusResponse = await app.inject({
        method: "GET",
        url: `/api/v1/smart-albums/rebuild/${rebuildPayload.data.taskId}`
      });
      assert.equal(rebuildStatusResponse.statusCode, 200);
      rebuildStatusPayload = rebuildStatusResponse.json() as RebuildStatusPayload;
      if (rebuildStatusPayload?.data.status === "completed" || rebuildStatusPayload?.data.status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
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

test("smart album routes persist ai generated rules and reuse them after ai is disabled", async () => {
  const app = Fastify();
  const suffix = crypto.randomUUID().replace(/-/g, "");
  const libraryRootId = `root_ai_${suffix}`;
  const timestamp = new Date().toISOString();
  const token = `creator-${suffix}`;

  clearLibraryCatalogDb();
  clearSmartAlbumDataDb();
  upsertLibraryRootDb({
    id: libraryRootId,
    name: `smart-root-ai-${suffix}`,
    path: `C:/smart-test-ai/${suffix}`,
    enabled: true,
    lastScannedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  seedAlbum({
    libraryRootId,
    sourcePath: `C:/smart-test-ai/${suffix}/set-a`,
    name: `${token} NO.001`
  });
  seedAlbum({
    libraryRootId,
    sourcePath: `C:/smart-test-ai/${suffix}/set-b`,
    name: `${token} NO.002`
  });

  try {
    await app.register(smartAlbumRoutes);
    await app.ready();

    await updateSmartAlbumAiConfig({
      enabled: true,
      mode: "assist",
      provider: "openai",
      apiEndpoint: "https://api.openai.com/v1",
      apiModel: "gpt-4.1-mini",
      minConfidenceAutoApply: 0.9,
      minClusterAlbumCount: 2,
      maxSuggestionsPerRun: 20,
      allowAliasMerge: true,
      allowCrossRootGrouping: true,
      excludedTokens: [],
      preferredScopes: ["albumName", "sourcePath"],
      reviewRequiredBelowConfidence: 0.9
    });

    const firstRebuildResponse = await app.inject({
      method: "POST",
      url: "/api/v1/smart-albums/rebuild"
    });
    assert.equal(firstRebuildResponse.statusCode, 200);
    const firstRebuildPayload = firstRebuildResponse.json() as {
      data: { taskId: string };
    };

    let firstStatus: { data: { status: string; result: { smartAlbumsDiscovered: number } | null } } | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/smart-albums/rebuild/${firstRebuildPayload.data.taskId}`
      });
      firstStatus = response.json() as { data: { status: string; result: { smartAlbumsDiscovered: number } | null } };
      if (firstStatus.data.status === "completed" || firstStatus.data.status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.equal(firstStatus?.data.status, "completed");

    const rulesResponse = await app.inject({
      method: "GET",
      url: "/api/v1/smart-album-rules"
    });
    assert.equal(rulesResponse.statusCode, 200);
    const rulesPayload = rulesResponse.json() as {
      data: { items: Array<{ sourceEngine: "manual" | "ai"; name: string }> };
    };
    assert.equal(rulesPayload.data.items.some((item) => item.sourceEngine === "ai"), true);

    await updateSmartAlbumAiConfig({
      enabled: false,
      mode: "assist",
      provider: "openai",
      apiEndpoint: "https://api.openai.com/v1",
      apiModel: "gpt-4.1-mini",
      minConfidenceAutoApply: 0.9,
      minClusterAlbumCount: 2,
      maxSuggestionsPerRun: 20,
      allowAliasMerge: true,
      allowCrossRootGrouping: true,
      excludedTokens: [],
      preferredScopes: ["albumName", "sourcePath"],
      reviewRequiredBelowConfidence: 0.9
    });

    const secondResult = await rebuildSmartAlbums();
    assert.equal(secondResult.smartAlbumsDiscovered >= 1, true);

    const smartAlbumsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/smart-albums"
    });
    assert.equal(smartAlbumsResponse.statusCode, 200);
    const smartAlbumsPayload = smartAlbumsResponse.json() as {
      data: { items: Array<{ name: string; albumCount: number }> };
    };
    assert.equal(smartAlbumsPayload.data.items.length >= 1, true);
    assert.equal(smartAlbumsPayload.data.items.some((item) => item.albumCount >= 2), true);
  } finally {
    await app.close();
  }
});
