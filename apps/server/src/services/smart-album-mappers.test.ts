import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_OPENAI_MODEL, toSmartAlbumAiConfigDto, toSmartAlbumRuleDto } from "./smart-album-mappers.js";
import type { SmartAlbumAiConfigRecord, SmartAlbumRuleRecord } from "../types/store.js";

test("toSmartAlbumRuleDto tolerates invalid json fields", () => {
  const timestamp = "2026-05-15T00:00:00.000Z";
  const record: SmartAlbumRuleRecord = {
    id: "rule_1",
    name: "规则",
    enabled: true,
    sourceEngine: "manual",
    priority: 100,
    scope: "albumName",
    matchMode: "contains",
    patternsJson: "not-json",
    normalizeOptionsJson: "not-json",
    action: "assignSmartAlbum",
    targetName: null,
    targetNameTemplate: "{{token}}",
    minAlbumCount: 2,
    minConfidence: 1,
    generatedNormalizedKey: null,
    generatedConfidence: null,
    generatedReason: null,
    generatedRunId: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const dto = toSmartAlbumRuleDto(record);

  assert.deepEqual(dto.patterns, []);
  assert.deepEqual(dto.normalizeOptions, {});
});

test("toSmartAlbumAiConfigDto masks token and filters unsupported scopes", () => {
  const timestamp = "2026-05-15T00:00:00.000Z";
  const record: SmartAlbumAiConfigRecord = {
    id: "smart_album_ai_config",
    enabled: true,
    mode: "assist",
    provider: "openai",
    apiEndpoint: "https://api.openai.com/v1/",
    apiToken: "sk-1234567890abcdef",
    apiModel: "",
    minConfidenceAutoApply: 0.9,
    minClusterAlbumCount: 2,
    maxSuggestionsPerRun: 20,
    allowAliasMerge: true,
    allowCrossRootGrouping: false,
    excludedTokensJson: JSON.stringify(["合集"]),
    preferredScopesJson: JSON.stringify(["albumName", "bad-scope", "sourcePath"]),
    reviewRequiredBelowConfidence: 0.75,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const dto = toSmartAlbumAiConfigDto(record);

  assert.equal(dto.apiModel, DEFAULT_OPENAI_MODEL);
  assert.equal(dto.hasApiToken, true);
  assert.equal(dto.apiTokenMasked, "sk-123...cdef");
  assert.deepEqual(dto.preferredScopes, ["albumName", "sourcePath"]);
});
