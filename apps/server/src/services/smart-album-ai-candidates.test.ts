import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAiPromptAlbums,
  buildAiRuntimeConfig,
  buildAiUserPrompt,
  testSmartAlbumAiProviderConnection
} from "./smart-album-ai-candidates.js";
import { DEFAULT_OPENAI_MODEL } from "./smart-album-mappers.js";
import type { SmartAlbumAiConfigRecord } from "../types/store.js";

const baseConfig = (): SmartAlbumAiConfigRecord => ({
  id: "smart_album_ai_config",
  enabled: true,
  mode: "assist",
  provider: "openai",
  apiEndpoint: "https://api.openai.com/v1/",
  apiToken: "  sk-token  ",
  apiModel: "",
  minConfidenceAutoApply: 0.9,
  minClusterAlbumCount: 2,
  maxSuggestionsPerRun: 20,
  allowAliasMerge: true,
  allowCrossRootGrouping: false,
  excludedTokensJson: "[]",
  preferredScopesJson: "[]",
  reviewRequiredBelowConfidence: 0.75,
  createdAt: "2026-05-15T00:00:00.000Z",
  updatedAt: "2026-05-15T00:00:00.000Z"
});

test("buildAiRuntimeConfig normalizes endpoint model and token overrides", () => {
  const runtime = buildAiRuntimeConfig(baseConfig(), {
    apiEndpoint: "https://example.com/v1/",
    apiModel: "  gpt-test  ",
    apiToken: "  override  "
  });

  assert.equal(runtime.endpoint, "https://example.com/v1");
  assert.equal(runtime.model, "gpt-test");
  assert.equal(runtime.apiToken, "override");

  const fallbackRuntime = buildAiRuntimeConfig({ ...baseConfig(), apiToken: null });
  assert.equal(fallbackRuntime.model, DEFAULT_OPENAI_MODEL);
  assert.equal(fallbackRuntime.apiToken, "");
});

test("buildAiUserPrompt includes parent path and output contract", () => {
  const albums = [
    {
      id: "alb_1",
      name: "作者 A 01",
      sourcePath: "C:/library/作者 A/01",
      assetCount: 12
    }
  ];

  assert.deepEqual(buildAiPromptAlbums(albums), [
    {
      id: "alb_1",
      name: "作者 A 01",
      sourcePath: "C:/library/作者 A/01",
      parentPath: "C:/library/作者 A",
      assetCount: 12
    }
  ]);

  const prompt = JSON.parse(buildAiUserPrompt(albums, 5));
  assert.equal(prompt.requirements.maxSuggestions, 5);
  assert.equal(prompt.requirements.avoidSingleAlbumGroups, true);
  assert.equal(prompt.albums[0].parentPath, "C:/library/作者 A");
});

test("testSmartAlbumAiProviderConnection reports missing token without network calls", async () => {
  const result = await testSmartAlbumAiProviderConnection({ ...baseConfig(), apiToken: null });

  assert.equal(result.success, false);
  assert.equal(result.message, "请先填写 OpenAI Token");
  assert.equal(result.model, DEFAULT_OPENAI_MODEL);
});
