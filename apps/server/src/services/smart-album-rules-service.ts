import type { SmartAlbumRuleDTO } from "../types/dto.js";
import type { SmartAlbumRuleRecord } from "../types/store.js";
import { getGalleryRepository } from "./storage-provider.js";
import { clearSmartAlbumQueryCaches, clearSmartAlbumRulesCache } from "./smart-album-service.js";

type SmartAlbumRuleInput = Omit<SmartAlbumRuleDTO, "id" | "createdAt" | "updatedAt">;

const parsePatterns = (patterns: string[]): string[] => patterns.map((item) => item.trim()).filter(Boolean);

const toRuleDto = (rule: SmartAlbumRuleRecord): SmartAlbumRuleDTO => ({
  id: rule.id,
  name: rule.name,
  enabled: rule.enabled,
  priority: rule.priority,
  scope: rule.scope,
  matchMode: rule.matchMode,
  patterns: JSON.parse(rule.patternsJson) as string[],
  normalizeOptions: JSON.parse(rule.normalizeOptionsJson) as SmartAlbumRuleDTO["normalizeOptions"],
  action: rule.action,
  targetName: rule.targetName,
  targetNameTemplate: rule.targetNameTemplate,
  minAlbumCount: rule.minAlbumCount,
  minConfidence: rule.minConfidence,
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt
});

export const createSmartAlbumRule = async (input: SmartAlbumRuleInput): Promise<SmartAlbumRuleDTO> => {
  const timestamp = new Date().toISOString();
  const record: SmartAlbumRuleRecord = {
    id: getGalleryRepository().makeId("sar"),
    name: input.name,
    enabled: input.enabled,
    priority: input.priority,
    scope: input.scope,
    matchMode: input.matchMode,
    patternsJson: JSON.stringify(parsePatterns(input.patterns)),
    normalizeOptionsJson: JSON.stringify(input.normalizeOptions),
    action: input.action,
    targetName: input.targetName,
    targetNameTemplate: input.targetNameTemplate,
    minAlbumCount: input.minAlbumCount,
    minConfidence: input.minConfidence,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const saved = await getGalleryRepository().upsertSmartAlbumRule(record);
  await clearSmartAlbumRulesCache();
  await clearSmartAlbumQueryCaches();
  return toRuleDto(saved);
};

export const updateSmartAlbumRule = async (ruleId: string, input: Partial<SmartAlbumRuleInput>): Promise<SmartAlbumRuleDTO | null> => {
  const existing = await getGalleryRepository().findSmartAlbumRuleById(ruleId);
  if (!existing) {
    return null;
  }
  const record: SmartAlbumRuleRecord = {
    ...existing,
    name: input.name ?? existing.name,
    enabled: input.enabled ?? existing.enabled,
    priority: input.priority ?? existing.priority,
    scope: input.scope ?? existing.scope,
    matchMode: input.matchMode ?? existing.matchMode,
    patternsJson: JSON.stringify(parsePatterns(input.patterns ?? (JSON.parse(existing.patternsJson) as string[]))),
    normalizeOptionsJson: JSON.stringify(input.normalizeOptions ?? JSON.parse(existing.normalizeOptionsJson)),
    action: input.action ?? existing.action,
    targetName: input.targetName === undefined ? existing.targetName : input.targetName,
    targetNameTemplate: input.targetNameTemplate === undefined ? existing.targetNameTemplate : input.targetNameTemplate,
    minAlbumCount: input.minAlbumCount ?? existing.minAlbumCount,
    minConfidence: input.minConfidence ?? existing.minConfidence,
    updatedAt: new Date().toISOString()
  };
  const saved = await getGalleryRepository().upsertSmartAlbumRule(record);
  await clearSmartAlbumRulesCache();
  await clearSmartAlbumQueryCaches();
  return toRuleDto(saved);
};

export const deleteSmartAlbumRule = async (ruleId: string): Promise<boolean> => {
  const deleted = await getGalleryRepository().deleteSmartAlbumRule(ruleId);
  if (deleted) {
    await clearSmartAlbumRulesCache();
    await clearSmartAlbumQueryCaches();
  }
  return deleted;
};
