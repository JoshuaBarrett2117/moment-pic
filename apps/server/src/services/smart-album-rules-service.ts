import type { SmartAlbumRuleDTO } from "../types/dto.js";
import type { SmartAlbumRuleRecord } from "../types/store.js";
import { deleteSmartAlbumRuleDb, findSmartAlbumRuleByIdDb, upsertSmartAlbumRuleDb } from "../repositories/smart-album-repository.js";
import { makeId } from "../repositories/ids.js";

type SmartAlbumRuleInput = Omit<SmartAlbumRuleDTO, "id" | "createdAt" | "updatedAt">;

const parsePatterns = (patterns: string[]): string[] => patterns.map((item) => item.trim()).filter(Boolean);

const toRuleDto = (rule: SmartAlbumRuleRecord): SmartAlbumRuleDTO => ({
  id: rule.id,
  name: rule.name,
  enabled: rule.enabled,
  sourceEngine: rule.sourceEngine,
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
  generatedNormalizedKey: rule.generatedNormalizedKey,
  generatedConfidence: rule.generatedConfidence,
  generatedReason: rule.generatedReason,
  generatedRunId: rule.generatedRunId,
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt
});

export const createSmartAlbumRule = async (input: SmartAlbumRuleInput): Promise<SmartAlbumRuleDTO> => {
  const timestamp = new Date().toISOString();
  const record: SmartAlbumRuleRecord = {
    id: makeId("sar"),
    name: input.name,
    enabled: input.enabled,
    sourceEngine: "manual",
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
    generatedNormalizedKey: null,
    generatedConfidence: null,
    generatedReason: null,
    generatedRunId: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return toRuleDto(upsertSmartAlbumRuleDb(record));
};

export const updateSmartAlbumRule = async (ruleId: string, input: Partial<SmartAlbumRuleInput>): Promise<SmartAlbumRuleDTO | null> => {
  const existing = findSmartAlbumRuleByIdDb(ruleId);
  if (!existing) {
    return null;
  }
  const record: SmartAlbumRuleRecord = {
    ...existing,
    sourceEngine: "manual",
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
    generatedNormalizedKey: null,
    generatedConfidence: null,
    generatedReason: null,
    generatedRunId: null,
    updatedAt: new Date().toISOString()
  };
  return toRuleDto(upsertSmartAlbumRuleDb(record));
};

export const deleteSmartAlbumRule = async (ruleId: string): Promise<boolean> => deleteSmartAlbumRuleDb(ruleId);
