import type {
  SmartAlbumAiConfigDTO,
  SmartAlbumRuleDTO,
  SmartAlbumRuleScopeDTO
} from "../types/dto.js";
import type {
  SmartAlbumAiConfigRecord,
  SmartAlbumRuleNormalizeOptions,
  SmartAlbumRuleRecord
} from "../types/store.js";
import { normalizeOpenAiEndpoint } from "./openai-compatible-service.js";
import { parseJsonArray } from "./smart-album-ai-rule-builder.js";

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

const parseNormalizeOptions = (value: string): SmartAlbumRuleNormalizeOptions => {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? (parsed as SmartAlbumRuleNormalizeOptions) : {};
  } catch {
    return {};
  }
};

export const toSmartAlbumRuleDto = (rule: SmartAlbumRuleRecord): SmartAlbumRuleDTO => ({
  id: rule.id,
  name: rule.name,
  enabled: rule.enabled,
  sourceEngine: rule.sourceEngine,
  priority: rule.priority,
  scope: rule.scope,
  matchMode: rule.matchMode,
  patterns: parseJsonArray(rule.patternsJson),
  normalizeOptions: parseNormalizeOptions(rule.normalizeOptionsJson),
  action: rule.action,
  targetName: rule.targetName,
  targetNameTemplate: rule.targetNameTemplate,
  minAlbumCount: rule.minAlbumCount,
  minConfidence: rule.minConfidence,
  generatedNormalizedKey: rule.generatedNormalizedKey,
  generatedConfidence: rule.generatedConfidence,
  generatedReason: rule.generatedReason,
  generatedRunId: rule.generatedRunId,
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt
});

export const toSmartAlbumAiConfigDto = (config: SmartAlbumAiConfigRecord): SmartAlbumAiConfigDTO => ({
  id: config.id,
  enabled: config.enabled,
  mode: config.mode,
  provider: "openai",
  apiEndpoint: normalizeOpenAiEndpoint(config.apiEndpoint),
  apiModel: config.apiModel || DEFAULT_OPENAI_MODEL,
  hasApiToken: Boolean(config.apiToken?.trim()),
  apiTokenMasked: config.apiToken?.trim() ? `${config.apiToken.trim().slice(0, 6)}...${config.apiToken.trim().slice(-4)}` : null,
  minConfidenceAutoApply: config.minConfidenceAutoApply,
  minClusterAlbumCount: config.minClusterAlbumCount,
  maxSuggestionsPerRun: config.maxSuggestionsPerRun,
  allowAliasMerge: config.allowAliasMerge,
  allowCrossRootGrouping: config.allowCrossRootGrouping,
  excludedTokens: parseJsonArray(config.excludedTokensJson),
  preferredScopes: parseJsonArray(config.preferredScopesJson).filter(
    (item): item is SmartAlbumRuleScopeDTO =>
      item === "albumName" || item === "sourcePath" || item === "parentPath" || item === "assetFileName"
  ),
  reviewRequiredBelowConfidence: config.reviewRequiredBelowConfidence,
  createdAt: config.createdAt,
  updatedAt: config.updatedAt
});
