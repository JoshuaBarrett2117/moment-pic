import { validateAiEndpoint } from "../lib/ai-endpoint.js";
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
  findAlbumsByIdsDb,
  listAlbumsForSmartRuleScopeDb,
  listAssetNamesByAlbumIdDb,
  listAssetNamesGroupedByAlbumDb
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
type ScopeAlbumRow = ReturnType<typeof listAlbumsForSmartRuleScopeDb>[number];
type AssetNameLookup = (albumId: string) => string[];

/** 单次规则计算内共享：只有出现 assetFileName 作用域时才一次性载入全部资产名。 */
const createAssetNameLookup = (rules: readonly SmartAlbumRuleDTO[]): AssetNameLookup => {
  let grouped: Map<string, string[]> | null = null;
  const needsAssetNames = rules.some((rule) => rule.scope === "assetFileName");
  return (albumId) => {
    if (!needsAssetNames) return listAssetNamesByAlbumIdDb(albumId);
    grouped ??= listAssetNamesGroupedByAlbumDb();
    return grouped.get(albumId) ?? [];
  };
};

const extractScopeTexts = (
  scope: SmartAlbumRuleScopeDTO,
  album: { id: string; name: string; sourcePath: string },
  assetNames: AssetNameLookup
): string[] => {
  if (scope === "albumName") {
    return [album.name];
  }
  if (scope === "sourcePath") {
    return [album.sourcePath];
  }
  if (scope === "parentPath") {
    return [path.dirname(album.sourcePath)];
  }
  return assetNames(album.id);
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

type CompiledPattern = {
  rawPattern: string;
  test: (haystack: string) => boolean;
  smartAlbumName: string;
  normalizedKey: string;
};

/** 规则模式只归一化、只编译一次，不在「图集 × 文本 × 模式」最内层重复做。 */
export const compileRulePatterns = (rule: SmartAlbumRuleDTO): CompiledPattern[] => {
  const compiled: CompiledPattern[] = [];
  for (const rawPattern of rule.patterns) {
    const normalizedPattern = normalizeSmartAlbumText(rawPattern, rule.normalizeOptions);
    if (!normalizedPattern) continue;
    const smartAlbumName = buildTargetName(rule, rawPattern);
    const normalizedKey = normalizeSmartAlbumText(smartAlbumName, rule.normalizeOptions);
    if (!normalizedKey) continue;
    let test: (haystack: string) => boolean;
    if (rule.matchMode === "equals") test = (haystack) => haystack === normalizedPattern;
    else if (rule.matchMode === "prefix") test = (haystack) => haystack.startsWith(normalizedPattern);
    else if (rule.matchMode === "suffix") test = (haystack) => haystack.endsWith(normalizedPattern);
    else if (rule.matchMode === "regex") {
      let regex: RegExp;
      try {
        regex = new RegExp(normalizedPattern, "i");
      } catch {
        continue;
      }
      test = (haystack) => regex.test(haystack);
    } else test = (haystack) => haystack.includes(normalizedPattern);
    compiled.push({ rawPattern, test, smartAlbumName, normalizedKey });
  }
  return compiled;
};

const buildRuleCandidates = (
  rule: SmartAlbumRuleDTO,
  albums: SmartAlbumScopeAlbum[],
  assetNames: AssetNameLookup = createAssetNameLookup([rule])
): CandidateRecord[] => {
  const patterns = compileRulePatterns(rule);
  if (patterns.length === 0) return [];
  const matches: CandidateRecord[] = [];
  const albumCounts = new Map<string, number>();

  for (const album of albums) {
    const texts = extractScopeTexts(rule.scope, album, assetNames);
    let matched = false;
    for (const rawText of texts) {
      const normalizedText = normalizeSmartAlbumText(rawText, rule.normalizeOptions);
      for (const pattern of patterns) {
        if (!pattern.test(normalizedText)) {
          continue;
        }

        matches.push({
          albumId: album.id,
          normalizedKey: pattern.normalizedKey,
          smartAlbumName: pattern.smartAlbumName,
          confidence: rule.minConfidence,
          sourceEngine: "rule",
          ruleId: rule.id,
          matchedScopes: [rule.scope],
          matchedTokens: [pattern.rawPattern],
          reason: `matched by rule:${rule.name}`
        });
        albumCounts.set(pattern.normalizedKey, (albumCounts.get(pattern.normalizedKey) ?? 0) + 1);
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

const buildSmartAlbumRecords = (
  candidates: CandidateRecord[],
  runId: string,
  albumsById: Map<string, ScopeAlbumRow>
) => {
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
      .map((item) => albumsById.get(item.albumId) ?? null)
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

const pickPreferredCandidates = (candidates: CandidateRecord[]): CandidateRecord[] => {
  const map = new Map<string, CandidateRecord>();
  for (const candidate of candidates) {
    const key = `${candidate.albumId}:${candidate.normalizedKey}`;
    const existing = map.get(key);
    const candidatePriority = candidate.sourceEngine === "rule" ? 2 : 1;
    const existingPriority = existing?.sourceEngine === "rule" ? 2 : 1;
    if (!existing || existingPriority < candidatePriority || (existingPriority === candidatePriority && existing.confidence < candidate.confidence)) {
      map.set(key, candidate);
    }
  }
  return Array.from(map.values());
};

export type RebuildSmartAlbumsOptions = {
  /** 是否调用 AI 重新聚类。扫描后的自动重建传 false，只套用已有规则（含已保存的 AI 规则）；手动重建默认 true。 */
  runAi?: boolean;
};

export const rebuildSmartAlbums = async (
  options: RebuildSmartAlbumsOptions = {}
): Promise<{ smartAlbumsDiscovered: number; membersDiscovered: number }> => {
  const runAi = options.runAi ?? true;
  const albums = listAlbumsForSmartRuleScopeDb();
  const albumsById = new Map(albums.map((album) => [album.id, album]));
  const isActiveRule = (rule: SmartAlbumRuleRecord) => rule.enabled && rule.action === "assignSmartAlbum";
  const rules = listSmartAlbumRulesDb().filter(isActiveRule);
  const baseRuleDtos = rules.filter((rule) => rule.sourceEngine !== "ai").map(toSmartAlbumRuleDto);
  const aiConfig = getSmartAlbumAiConfigDb();

  let aiRuleDtos = rules.filter((rule) => rule.sourceEngine === "ai").map(toSmartAlbumRuleDto);
  const assetNames = createAssetNameLookup([...baseRuleDtos, ...aiRuleDtos]);
  // 非 AI 规则只算一遍：既用于 AI 的「剩余图集」，也直接进入最终候选。
  const baseCandidates = baseRuleDtos.flatMap((rule) => buildRuleCandidates(rule, albums, assetNames));

  if (aiConfig.enabled && runAi) {
    const coveredAlbumIds = collectCandidateAlbumIds(baseCandidates);
    const remainingAlbums = albums.filter((album) => !coveredAlbumIds.has(album.id));
    const aiCandidates = remainingAlbums.length >= aiConfig.minClusterAlbumCount
      ? await buildAiCandidates(aiConfig, remainingAlbums)
      : [];
    const aiRules = aiCandidates.length > 0
      ? buildSmartAlbumRuleRecords(aiCandidates, remainingAlbums, makeId("srun"), aiConfig)
      : [];
    replaceSmartAlbumRulesBySourceEngineDb("ai", aiRules);
    aiRuleDtos = listSmartAlbumRulesDb()
      .filter((rule) => isActiveRule(rule) && rule.sourceEngine === "ai")
      .map(toSmartAlbumRuleDto);
  }

  const aiAssetNames = aiRuleDtos.some((rule) => rule.scope === "assetFileName") ? createAssetNameLookup(aiRuleDtos) : assetNames;
  const aiCandidates = aiRuleDtos.flatMap((rule) => buildRuleCandidates(rule, albums, aiAssetNames));
  const candidates = pickPreferredCandidates([...baseCandidates, ...aiCandidates]);

  const runId = makeId("srun");
  const payload = buildSmartAlbumRecords(candidates, runId, albumsById);
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
  const members = listSmartAlbumMembersDb(smartAlbumId);
  const albumsById = findAlbumsByIdsDb(members.map((member) => member.albumId));
  return members
    .map((member) => {
      const album = albumsById.get(member.albumId);
      if (!album) {
        return null;
      }
      return {
        albumId: album.id,
        name: album.name,
        sourceType: album.sourceType,
        assetCount: album.assetCount,
        coverUrl: album.coverAssetId ? `/api/v1/assets/${album.coverAssetId}/thumbnail` : null,
        isFavorite: Boolean(album.isFavorite),
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
    apiEndpoint: validateAiEndpoint(normalizeOpenAiEndpoint(input.apiEndpoint)),
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
  const matches = buildRuleCandidates(ruleDto, listAlbumsForSmartRuleScopeDb());
  const albumsById = findAlbumsByIdsDb(matches.map((item) => item.albumId));
  const matchedAlbums = matches
    .map((item) => {
      const album = albumsById.get(item.albumId);
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
