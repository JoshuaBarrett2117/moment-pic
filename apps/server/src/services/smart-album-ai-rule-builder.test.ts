import assert from "node:assert/strict";
import test from "node:test";

import type { SmartAlbumAiConfigRecord } from "../types/store.js";
import {
  buildHeuristicAiCandidates,
  mapAiClustersToCandidates,
  normalizeSmartAlbumText,
  parseJsonArray
} from "./smart-album-ai-rule-builder.js";

const createAiConfig = (overrides: Partial<SmartAlbumAiConfigRecord> = {}): SmartAlbumAiConfigRecord => ({
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
  preferredScopesJson: JSON.stringify(["sourcePath", "albumName"]),
  reviewRequiredBelowConfidence: 0.9,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

test("parseJsonArray only keeps string items and tolerates invalid json", () => {
  assert.deepEqual(parseJsonArray('["alpha", 1, "beta", false]'), ["alpha", "beta"]);
  assert.deepEqual(parseJsonArray("{broken"), []);
});

test("normalizeSmartAlbumText strips noisy leading sequence, date, page and size tokens", () => {
  const normalized = normalizeSmartAlbumText("12-星之迟迟 2024-01-02 128p 1.5gb", {
    trimSpaces: true,
    normalizeCase: true,
    stripSequenceNo: true,
    stripDate: true,
    stripPageStats: true,
    stripSizeStats: true
  });

  assert.equal(normalized, "星之迟迟");
});

test("mapAiClustersToCandidates removes unknown and duplicate album ids", () => {
  const candidates = mapAiClustersToCandidates(
    [
      {
        name: "小恩 R18 写真",
        albumIds: ["alb_1", "alb_1", "missing", "alb_2"],
        confidence: 1.4,
        reason: "same subject"
      }
    ],
    new Map([
      ["alb_1", { id: "alb_1", name: "one", sourcePath: "/gallery/小恩/R18/001", assetCount: 10, sourceType: "folder" }],
      ["alb_2", { id: "alb_2", name: "two", sourcePath: "/gallery/小恩/R18/002", assetCount: 12, sourceType: "folder" }]
    ])
  );

  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map((item) => item.albumId), ["alb_1", "alb_2"]);
  assert.equal(candidates[0]?.confidence, 1);
  assert.equal(candidates[0]?.normalizedKey, "小恩 r18 写真");
});

test("buildHeuristicAiCandidates respects excluded tokens and minimum cluster size", () => {
  const candidates = buildHeuristicAiCandidates(
    createAiConfig({
      excludedTokensJson: JSON.stringify(["moment"])
    }),
    [
      { id: "alb_1", name: "moment 001", sourcePath: "/root/小恩/R18/001", assetCount: 10, sourceType: "folder" },
      { id: "alb_2", name: "moment 002", sourcePath: "/root/小恩/R18/002", assetCount: 12, sourceType: "folder" },
      { id: "alb_3", name: "other", sourcePath: "/root/其他/003", assetCount: 8, sourceType: "folder" }
    ]
  );

  assert.equal(candidates.some((item) => item.normalizedKey === "moment"), false);
  assert.deepEqual(
    candidates.filter((item) => item.normalizedKey === "小恩").map((item) => item.albumId),
    ["alb_1", "alb_2"]
  );
});
