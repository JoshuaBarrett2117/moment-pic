import path from "node:path";

import type {
  SmartAlbumAiConfigDTO,
  SmartAlbumAiConnectionTestDTO,
  SmartAlbumDetailDTO,
  SmartAlbumListItemDTO,
  SmartAlbumMemberDTO,
  SmartAlbumRuleDTO,
  SmartAlbumRuleScopeDTO,
  SmartAlbumRuleTestResultDTO
} from "../types/dto.js";
import type {
  SmartAlbumAiConfigRecord,
  SmartAlbumMatchRecord,
  SmartAlbumMemberRecord,
  SmartAlbumRecord,
  SmartAlbumRuleRecord
} from "../types/store.js";
import { normalizeOpenAiEndpoint } from "./openai-compatible-service.js";
import {
  buildSmartAlbumRuleRecords,
  normalizeSmartAlbumText,
  type CandidateRecord,
  type SmartAlbumScopeAlbum
} from "./smart-album-ai-rule-builder.js";
import { DEFAULT_OPENAI_MODEL, toSmartAlbumAiConfigDto, toSmartAlbumRuleDto } from "./smart-album-mappers.js";
import {
  buildAiCandidates,
  testSmartAlbumAiProviderConnection,
  type SmartAlbumAiConnectionTestInput
} from "./smart-album-ai-candidates.js";
import {
  findAlbumByIdDb,
  listAlbumsForSmartRuleScopeDb,
  listAssetNamesByAlbumIdDb
} from "../repositories/album-repository.js";
import {
  getSmartAlbumAiConfigDb,
  listSmartAlbumMembersDb,
  listSmartAlbumRulesDb,
  listSmartAlbumsDb,
  replaceSmartAlbumRulesBySourceEngineDb,
  replaceSmartAlbumsDb,
  findSmartAlbumRuleByIdDb,
  findSmartAlbumByIdDb,
  updateSmartAlbumAiConfigDb
} from "../repositories/smart-album-repository.js";
import { makeId } from "../repositories/ids.js";

export { areAiRulePatternsAligned, buildRulePatternsFromAlbums, buildSmartAlbumRuleRecords } from "./smart-album-ai-rule-builder.js";

type SmartAlbumRuleInput = Omit<SmartAlbumRuleDTO, "id" | "createdAt" | "updatedAt">;
type SmartAlbumAiConfigInput = {
  enabled: boolean;
  mode: SmartAlbumAiConfigDTO["mode"];
  provider: "openai";
  apiEndpoint: string;
  apiModel: string;
  apiToken?: string | null;
  minConfidenceAutoApply: number;
  minClusterAlbumCount: number;
  maxSuggestionsPerRun: number;
  allowAliasMerge: boolean;
  allowCrossRootGrouping: boolean;
  excludedTokens: string[];
  preferredScopes: SmartAlbumRuleScopeDTO[];
  reviewRequiredBelowConfidence: number;
};
const extractScopeTexts = (scope: SmartAlbumRuleScopeDTO, album: { id: string; name: string; sourcePath: string }): string[] => {
  if (scope === "albumName") {
    return [album.name];
  }
  if (scope === "sourcePath") {
    return [album.sourcePath];
  }
  if (scope === "parentPath") {
    return [path.dirname(album.sourcePath)];
  }
  return listAssetNamesByAlbumIdDb(album.id);
};

const buildTargetName = (rule: SmartAlbumRuleDTO, matchedToken: string): string => {
  if (rule.targetName?.trim()) {
    return rule.targetName.trim();
  }
  if (rule.targetNameTemplate?.trim()) {
    return rule.targetNameTemplate.replace(/\{\{\s*token\s*\}\}/gi, matchedToken).trim();
  }
  return matchedToken;
};

const matchPattern = (mode: SmartAlbumRuleDTO["matchMode"], haystack: string, pattern: string): boolean => {
  if (mode === "equals") {
    return haystack === pattern;
  }
  if (mode === "prefix") {
    return haystack.startsWith(pattern);
  }
  if (mode === "suffix") {
    return haystack.endsWith(pattern);
  }
  if (mode === "regex") {
    try {
      return new RegExp(pattern, "i").test(haystack);
    } catch {
      return false;
    }
  }
  return haystack.includes(pattern);
};

const buildRuleCandidates = (rule: SmartAlbumRuleDTO, albums: SmartAlbumScopeAlbum[]): CandidateRecord[] => {
  const matches: CandidateRecord[] = [];
  const albumCounts = new Map<string, number>();

  for (const album of albums) {
    const texts = extractScopeTexts(rule.scope, album);
    let matched = false;
    for (const rawText of texts) {
      const normalizedText = normalizeSmartAlbumText(rawText, rule.normalizeOptions);
      for (const rawPattern of rule.patterns) {
        const normalizedPattern = normalizeSmartAlbumText(rawPattern, rule.normalizeOptions);
        if (!normalizedPattern) {
          continue;
        }
        if (!matchPattern(rule.matchMode, normalizedText, normalizedPattern)) {
          continue;
        }

        const targetName = buildTargetName(rule, rawPattern);
        const normalizedKey = normalizeSmartAlbumText(targetName, rule.normalizeOptions);
        if (!normalizedKey) {
          continue;
        }

        matches.push({
          albumId: album.id,
          normalizedKey,
          smartAlbumName: targetName,
          confidence: rule.minConfidence,
          sourceEngine: "rule",
          ruleId: rule.id,
          matchedScopes: [rule.scope],
          matchedTokens: [rawPattern],
          reason: `matched by rule:${rule.name}`
        });
        albumCounts.set(normalizedKey, (albumCounts.get(normalizedKey) ?? 0) + 1);
        matched = true;
        break;
      }
      if (matched) {
        break;
      }
    }
  }

  return matches.filter((match) => (albumCounts.get(match.normalizedKey) ?? 0) >= rule.minAlbumCount);
};

const buildSmartAlbumRecords = (candidates: CandidateRecord[], runId: string) => {
  const grouped = new Map<string, CandidateRecord[]>();
  for (const candidate of candidates) {
    const current = grouped.get(candidate.normalizedKey) ?? [];
    current.push(candidate);
    grouped.set(candidate.normalizedKey, current);
  }

  const smartAlbums: SmartAlbumRecord[] = [];
  const members: SmartAlbumMemberRecord[] = [];
  const matchRecords: SmartAlbumMatchRecord[] = [];
  const timestamp = new Date().toISOString();

  for (const [normalizedKey, items] of grouped.entries()) {
    const albumRows = items
      .map((item) => findAlbumByIdDb(item.albumId))
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (albumRows.length === 0) {
      continue;
    }

    const smartAlbumId = makeId("salb");
    const sourceSummary = Array.from(new Set(items.map((item) => item.matchedTokens.join(", ")).filter(Boolean))).slice(0, 3).join(" / ");
    const coverAssetId = albumRows.find((album) => album.coverAssetId)?.coverAssetId ?? null;
    const smartAlbum: SmartAlbumRecord = {
      id: smartAlbumId,
      name: items[0].smartAlbumName,
      normalizedKey,
      coverAssetId,
      albumCount: albumRows.length,
      assetCount: albumRows.reduce((sum, album) => sum + album.assetCount, 0),
      sourceSummary: sourceSummary || null,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    smartAlbums.push(smartAlbum);

    for (const item of items) {
      const matchRecordId = makeId("smr");
      matchRecords.push({
        id: matchRecordId,
        albumId: item.albumId,
        smartAlbumName: item.smartAlbumName,
        normalizedKey: item.normalizedKey,
        sourceEngine: item.sourceEngine,
        ruleId: item.ruleId,
        confidence: item.confidence,
        matchedScopesJson: JSON.stringify(item.matchedScopes),
        matchedTokensJson: JSON.stringify(item.matchedTokens),
        reason: item.reason,
        runId,
        createdAt: timestamp
      });
      members.push({
        id: makeId("smb"),
        smartAlbumId,
        albumId: item.albumId,
        sourceEngine: item.sourceEngine,
        matchRecordId,
        confidence: item.confidence,
        isPinned: false,
        isExcluded: false,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  }

  return { smartAlbums, members, matchRecords };
};

const collectCandidateAlbumIds = (candidates: CandidateRecord[]): Set<string> => new Set(candidates.map((candidate) => candidate.albumId));

export const rebuildSmartAlbums = async (): Promise<{ smartAlbumsDiscovered: number; membersDiscovered: number }> => {
  const albums = listAlbumsForSmartRuleScopeDb();
  const rules = listSmartAlbumRulesDb().filter((rule) => rule.enabled && rule.action === "assignSmartAlbum");
  const baseRules = rules.filter((rule) => rule.sourceEngine !== "ai");
  const baseRuleDtos = baseRules.map(toSmartAlbumRuleDto);
  const baseCandidates = baseRuleDtos.flatMap((rule) => buildRuleCandidates(rule, albums));
  const coveredAlbumIds = collectCandidateAlbumIds(baseCandidates);
  const remainingAlbums = albums.filter((album) => !coveredAlbumIds.has(album.id));
  const aiConfig = getSmartAlbumAiConfigDb();

  if (aiConfig.enabled) {
    const aiCandidates = remainingAlbums.length >= aiConfig.minClusterAlbumCount
      ? await buildAiCandidates(aiConfig, remainingAlbums)
      : [];
    const aiRules = aiCandidates.length > 0
      ? buildSmartAlbumRuleRecords(aiCandidates, remainingAlbums, makeId("srun"), aiConfig)
      : [];
    replaceSmartAlbumRulesBySourceEngineDb("ai", aiRules);
  }

  const refreshedRules = listSmartAlbumRulesDb().filter((rule) => rule.enabled && rule.action === "assignSmartAlbum");
  const candidates = refreshedRules
    .flatMap((rule) => buildRuleCandidates(toSmartAlbumRuleDto(rule), albums))
    .reduce((map, candidate) => {
      const key = `${candidate.albumId}:${candidate.normalizedKey}`;
      const existing = map.get(key);
      const candidatePriority = candidate.sourceEngine === "rule" ? 2 : 1;
      const existingPriority = existing?.sourceEngine === "rule" ? 2 : 1;
      if (!existing || existingPriority < candidatePriority || (existingPriority === candidatePriority && existing.confidence < candidate.confidence)) {
        map.set(key, candidate);
      }
      return map;
    }, new Map<string, CandidateRecord>());

  const runId = makeId("srun");
  const payload = buildSmartAlbumRecords(Array.from(candidates.values()), runId);
  replaceSmartAlbumsDb(payload);

  return {
    smartAlbumsDiscovered: payload.smartAlbums.length,
    membersDiscovered: payload.members.length
  };
};

export const listSmartAlbums = async (
  page: number,
  pageSize: number,
  input?: {
    keyword?: string;
    status?: "active" | "hidden" | "review_pending";
    sortBy?: "name" | "updatedAt" | "albumCount" | "assetCount";
    sortOrder?: "asc" | "desc";
  }
) => {
  const result = listSmartAlbumsDb(page, pageSize, input);
  return {
    items: result.items.map((item): SmartAlbumListItemDTO => ({
      id: item.id,
      name: item.name,
      coverUrl: item.coverAssetId ? `/api/v1/assets/${item.coverAssetId}/thumbnail` : null,
      albumCount: item.albumCount,
      assetCount: item.assetCount,
      status: item.status,
      updatedAt: item.updatedAt
    })),
    pagination: {
      page,
      pageSize,
      total: result.total
    }
  };
};

export const getSmartAlbumDetail = async (smartAlbumId: string): Promise<SmartAlbumDetailDTO | null> => {
  const item = findSmartAlbumByIdDb(smartAlbumId);
  if (!item) {
    return null;
  }
  return {
    id: item.id,
    name: item.name,
    coverUrl: item.coverAssetId ? `/api/v1/assets/${item.coverAssetId}/thumbnail` : null,
    albumCount: item.albumCount,
    assetCount: item.assetCount,
    sourceSummary: item.sourceSummary,
    status: item.status,
    updatedAt: item.updatedAt
  };
};

export const getSmartAlbumMembers = async (smartAlbumId: string): Promise<SmartAlbumMemberDTO[] | null> => {
  const smartAlbum = findSmartAlbumByIdDb(smartAlbumId);
  if (!smartAlbum) {
    return null;
  }
  return listSmartAlbumMembersDb(smartAlbumId)
    .map((member) => {
      const album = findAlbumByIdDb(member.albumId);
      if (!album) {
        return null;
      }
      return {
        albumId: album.id,
        name: album.name,
        sourceType: album.sourceType,
        assetCount: album.assetCount,
        coverUrl: album.coverAssetId ? `/api/v1/assets/${album.coverAssetId}/thumbnail` : null,
        updatedAt: album.updatedAt,
        sourceEngine: member.sourceEngine,
        confidence: member.confidence
      } satisfies SmartAlbumMemberDTO;
    })
    .filter((item): item is SmartAlbumMemberDTO => item !== null);
};

export const listSmartAlbumRules = async (): Promise<SmartAlbumRuleDTO[]> => listSmartAlbumRulesDb().map(toSmartAlbumRuleDto);

export const getSmartAlbumAiConfig = async (): Promise<SmartAlbumAiConfigDTO> => toSmartAlbumAiConfigDto(getSmartAlbumAiConfigDb());

export const updateSmartAlbumAiConfig = async (input: SmartAlbumAiConfigInput): Promise<SmartAlbumAiConfigDTO> => {
  const existing = getSmartAlbumAiConfigDb();
  const nextToken = input.apiToken === undefined
    ? existing.apiToken
    : (input.apiToken?.trim() ? input.apiToken.trim() : null);
  const updated = updateSmartAlbumAiConfigDb({
    id: "smart_album_ai_config",
    enabled: input.enabled,
    mode: input.mode,
    provider: "openai",
    apiEndpoint: normalizeOpenAiEndpoint(input.apiEndpoint),
    apiToken: nextToken,
    apiModel: input.apiModel.trim() || DEFAULT_OPENAI_MODEL,
    minConfidenceAutoApply: input.minConfidenceAutoApply,
    minClusterAlbumCount: input.minClusterAlbumCount,
    maxSuggestionsPerRun: input.maxSuggestionsPerRun,
    allowAliasMerge: input.allowAliasMerge,
    allowCrossRootGrouping: input.allowCrossRootGrouping,
    excludedTokensJson: JSON.stringify(input.excludedTokens),
    preferredScopesJson: JSON.stringify(input.preferredScopes),
    reviewRequiredBelowConfidence: input.reviewRequiredBelowConfidence
  });
  return toSmartAlbumAiConfigDto(updated);
};

export const testSmartAlbumAiConnection = async (input?: SmartAlbumAiConnectionTestInput): Promise<SmartAlbumAiConnectionTestDTO> => {
  const config = getSmartAlbumAiConfigDb();
  return testSmartAlbumAiProviderConnection(config, input);
};

export const testSmartAlbumRule = async (ruleId: string): Promise<SmartAlbumRuleTestResultDTO | null> => {
  const rule = findSmartAlbumRuleByIdDb(ruleId);
  if (!rule) {
    return null;
  }
  const ruleDto = toSmartAlbumRuleDto(rule);
  const matchedAlbums = buildRuleCandidates(ruleDto, listAlbumsForSmartRuleScopeDb())
    .map((item) => {
      const album = findAlbumByIdDb(item.albumId);
      if (!album) {
        return null;
      }
      return {
        albumId: album.id,
        name: album.name,
        targetName: item.smartAlbumName
      };
    })
    .filter((item): item is { albumId: string; name: string; targetName: string } => item !== null);
  return {
    rule: ruleDto,
    matchedAlbums
  };
};
