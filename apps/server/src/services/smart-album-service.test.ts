import assert from "node:assert/strict";
import test from "node:test";

import type { SmartAlbumAiConfigRecord } from "../types/store.js";
import { areAiRulePatternsAligned, buildRulePatternsFromAlbums, buildSmartAlbumRuleRecords } from "./smart-album-service.js";

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

test("buildRulePatternsFromAlbums strips noisy target suffixes and ignores top-level path tokens", () => {
  const patterns = buildRulePatternsFromAlbums(
    [
      {
        id: "alb_1",
        name: "set-1",
        sourcePath: "/volume4/pt1/瞬间/蠢沐沐/星之迟迟作品/001",
        assetCount: 12,
        sourceType: "folder"
      },
      {
        id: "alb_2",
        name: "set-2",
        sourcePath: "/volume4/pt1/瞬间/蠢沐沐/星之迟迟作品/002",
        assetCount: 16,
        sourceType: "folder"
      }
    ],
    "sourcePath",
    createAiConfig(),
    "星之迟迟作品"
  );

  assert.equal(patterns.includes("volume4"), false);
  assert.equal(patterns.includes("pt1"), false);
  assert.equal(patterns.includes("瞬间"), false);
  assert.equal(patterns.includes("星之迟迟"), true);
  assert.equal(patterns.includes("星之迟迟作品"), false);
});

test("areAiRulePatternsAligned accepts target-name tokens and full-name patterns", () => {
  assert.equal(areAiRulePatternsAligned(["小恩", "r18"], "小恩 R18 写真"), true);
  assert.equal(areAiRulePatternsAligned(["艾米利亚 - 蠢沐沐"], "艾米利亚 - 蠢沐沐"), true);
  assert.equal(areAiRulePatternsAligned(["尖耳国度"], "尖耳国度系列"), true);
  assert.equal(areAiRulePatternsAligned(["星之迟迟"], "星之迟迟作品"), true);
  assert.equal(areAiRulePatternsAligned(["蠢沐沐"], "尖耳国度系列"), false);
});

test("buildSmartAlbumRuleRecords skips ai rules when extracted patterns do not align with target name", () => {
  const rules = buildSmartAlbumRuleRecords(
    [
      {
        albumId: "alb_1",
        normalizedKey: "尖耳国度系列",
        smartAlbumName: "尖耳国度系列",
        confidence: 0.98,
        sourceEngine: "ai",
        ruleId: null,
        matchedScopes: ["albumName"],
        matchedTokens: ["尖耳国度系列"],
        reason: "matched by openai"
      },
      {
        albumId: "alb_2",
        normalizedKey: "尖耳国度系列",
        smartAlbumName: "尖耳国度系列",
        confidence: 0.98,
        sourceEngine: "ai",
        ruleId: null,
        matchedScopes: ["albumName"],
        matchedTokens: ["尖耳国度系列"],
        reason: "matched by openai"
      }
    ],
    [
      {
        id: "alb_1",
        name: "『A』-蠢沐沐-40P-Moment",
        sourcePath: "/volume1/pt1/瞬间/『A』-蠢沐沐-40P-Moment.zip",
        assetCount: 40,
        sourceType: "zip"
      },
      {
        id: "alb_2",
        name: "『B』-蠢沐沐-40P-Moment",
        sourcePath: "/volume1/pt1/瞬间/『B』-蠢沐沐-40P-Moment.zip",
        assetCount: 40,
        sourceType: "zip"
      }
    ],
    "srun_test",
    createAiConfig()
  );

  assert.deepEqual(rules, []);
});

test("buildSmartAlbumRuleRecords merges ai rules that resolve to the same keyword set", () => {
  const rules = buildSmartAlbumRuleRecords(
    [
      {
        albumId: "alb_1",
        normalizedKey: "小恩 r18 写真",
        smartAlbumName: "小恩 R18 写真",
        confidence: 0.98,
        sourceEngine: "ai",
        ruleId: null,
        matchedScopes: ["sourcePath"],
        matchedTokens: ["小恩 R18 写真"],
        reason: "matched by openai"
      },
      {
        albumId: "alb_2",
        normalizedKey: "小恩 r18 写真",
        smartAlbumName: "小恩 R18 写真",
        confidence: 0.98,
        sourceEngine: "ai",
        ruleId: null,
        matchedScopes: ["sourcePath"],
        matchedTokens: ["小恩 R18 写真"],
        reason: "matched by openai"
      },
      {
        albumId: "alb_3",
        normalizedKey: "小恩 r18 图集",
        smartAlbumName: "小恩 R18 图集",
        confidence: 0.97,
        sourceEngine: "ai",
        ruleId: null,
        matchedScopes: ["sourcePath"],
        matchedTokens: ["小恩 R18 图集"],
        reason: "matched by openai"
      },
      {
        albumId: "alb_4",
        normalizedKey: "小恩 r18 图集",
        smartAlbumName: "小恩 R18 图集",
        confidence: 0.97,
        sourceEngine: "ai",
        ruleId: null,
        matchedScopes: ["sourcePath"],
        matchedTokens: ["小恩 R18 图集"],
        reason: "matched by openai"
      }
    ],
    [
      {
        id: "alb_1",
        name: "alpha-one",
        sourcePath: "C:/gallery/video/pic/vip/volume4/小恩/R18/001",
        assetCount: 12,
        sourceType: "folder"
      },
      {
        id: "alb_2",
        name: "bravo-two",
        sourcePath: "D:/archive/video/pic/vip/volume4/小恩/R18/002",
        assetCount: 16,
        sourceType: "folder"
      },
      {
        id: "alb_3",
        name: "charlie-three",
        sourcePath: "E:/archive/video/pic/vip/volume4/小恩/R18/003",
        assetCount: 14,
        sourceType: "folder"
      },
      {
        id: "alb_4",
        name: "delta-four",
        sourcePath: "F:/archive/video/pic/vip/volume4/小恩/R18/004",
        assetCount: 15,
        sourceType: "folder"
      }
    ],
    "srun_test",
    createAiConfig()
  );

  assert.equal(rules.length, 1);
  assert.deepEqual(JSON.parse(rules[0]?.patternsJson ?? "[]"), ["小恩", "r18"]);
});
