import assert from "node:assert/strict";
import test from "node:test";

import type { SmartAlbumAiConfigRecord } from "../types/store.js";
import { buildRulePatternsFromAlbums } from "./smart-album-service.js";

const createAiConfig = (): SmartAlbumAiConfigRecord => ({
  id: "smart_album_ai_config",
  enabled: true,
  mode: "assist",
  provider: "openai",
  apiEndpoint: "https://api.openai.com/v1",
  apiToken: null,
  apiModel: "gpt-4.1-mini",
  minConfidenceAutoApply: 0.9,
  minClusterAlbumCount: 2,
  maxSuggestionsPerRun: 20,
  allowAliasMerge: true,
  allowCrossRootGrouping: true,
  excludedTokensJson: JSON.stringify([]),
  preferredScopesJson: JSON.stringify(["albumName", "sourcePath"]),
  reviewRequiredBelowConfidence: 0.9,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

test("buildRulePatternsFromAlbums prefers target-name tokens over noisy shared path tokens", () => {
  const patterns = buildRulePatternsFromAlbums(
    [
      {
        id: "alb_1",
        name: "set-1",
        sourcePath: "C:/gallery/video/pic/vip/volume4/小恩/R18/001",
        assetCount: 12,
        sourceType: "folder"
      },
      {
        id: "alb_2",
        name: "set-2",
        sourcePath: "D:/archive/video/pic/vip/volume4/小恩/R18/002",
        assetCount: 16,
        sourceType: "folder"
      }
    ],
    "sourcePath",
    createAiConfig(),
    "小恩 R18 写真"
  );

  assert.deepEqual(patterns.slice(0, 2), ["小恩", "r18"]);
  assert.equal(patterns.includes("volume4"), false);
  assert.equal(patterns.includes("video"), false);
  assert.equal(patterns.includes("pic"), false);
  assert.equal(patterns.includes("vip"), false);
});
