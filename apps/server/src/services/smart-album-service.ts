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
  SmartAlbumRuleNormalizeOptions,
  SmartAlbumRuleRecord
} from "../types/store.js";
import { createOpenAiChatCompletion, normalizeOpenAiEndpoint, parseJsonFromModelText } from "./openai-compatible-service.js";
import {
  findAlbumByIdDb,
  findSmartAlbumByIdDb,
  findSmartAlbumRuleByIdDb,
  getSmartAlbumAiConfigDb,
  listAlbumsForSmartRuleScopeDb,
  listAssetNamesByAlbumIdDb,
  listSmartAlbumMembersDb,
  listSmartAlbumRulesDb,
  listSmartAlbumsDb,
  makeId,
  replaceSmartAlbumsDb,
  updateSmartAlbumAiConfigDb
} from "./sqlite-store.js";

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
type SmartAlbumAiConnectionTestInput = {
  provider?: "openai";
  apiEndpoint?: string;
  apiModel?: string;
  apiToken?: string | null;
};

type CandidateRecord = {
  albumId: string;
  normalizedKey: string;
  smartAlbumName: string;
  confidence: number;
  sourceEngine: "rule" | "ai";
  ruleId: string | null;
  matchedScopes: SmartAlbumRuleScopeDTO[];
  matchedTokens: string[];
  reason: string;
};

type AiCluster = {
  name: string;
  albumIds: string[];
  confidence: number;
  reason: string;
};

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const MAX_AI_ALBUMS_PER_BATCH = 40;
const OPENAI_GROUPING_TIMEOUT_MS = 90000;

const parseJsonArray = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const parseNormalizeOptions = (value: string): SmartAlbumRuleNormalizeOptions => {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? (parsed as SmartAlbumRuleNormalizeOptions) : {};
  } catch {
    return {};
  }
};

const toRuleDto = (rule: SmartAlbumRuleRecord): SmartAlbumRuleDTO => ({
  id: rule.id,
  name: rule.name,
  enabled: rule.enabled,
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
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt
});

const toAiConfigDto = (config: SmartAlbumAiConfigRecord): SmartAlbumAiConfigDTO => ({
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

const buildAiRuntimeConfig = (config: SmartAlbumAiConfigRecord, overrides?: SmartAlbumAiConnectionTestInput) => {
  const endpoint = normalizeOpenAiEndpoint(overrides?.apiEndpoint ?? config.apiEndpoint);
  const model = (overrides?.apiModel ?? config.apiModel ?? DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;
  const apiToken = overrides?.apiToken === undefined
    ? (config.apiToken?.trim() || "")
    : (overrides.apiToken?.trim() || "");

  return {
    endpoint,
    model,
    apiToken
  };
};

const buildAiPromptAlbums = (
  albums: Array<{
    id: string;
    name: string;
    sourcePath: string;
    assetCount: number;
  }>
) => albums.map((album) => ({
  id: album.id,
  name: album.name,
  sourcePath: album.sourcePath,
  parentPath: path.dirname(album.sourcePath),
  assetCount: album.assetCount
}));

const buildAiSystemPrompt = () => [
  "你是一个本地图库自动归纳助手。",
  "请基于用户自己的图集内容，把明显属于同一人物、作者、系列、品牌或作品线的多个普通图集归纳到同一个自动整理下。",
  "不要写死示例名称，不要臆造不存在的主体，不要输出单图集分组。",
  "只有在你高度确信多个图集确实属于同一主题时才分组。",
  "请严格返回 JSON，不要输出解释性文本。"
].join("");

const buildAiUserPrompt = (
  albums: Array<{
    id: string;
    name: string;
    sourcePath: string;
    assetCount: number;
  }>,
  maxSuggestions: number
) => JSON.stringify({
  task: "group_albums",
  requirements: {
    maxSuggestions,
    minAlbumsPerGroup: 2,
    fields: ["name", "albumIds", "confidence", "reason"],
    confidenceRange: "0-1",
    avoidSingleAlbumGroups: true,
    output: {
      clusters: [
        {
          name: "归纳名称",
          albumIds: ["必须使用输入中的 album id"],
          confidence: 0.92,
          reason: "简短说明依据"
        }
      ]
    }
  },
  albums: buildAiPromptAlbums(albums)
});

const normalizeText = (input: string, options: SmartAlbumRuleNormalizeOptions): string => {
  let output = input.normalize("NFKC");
  if (options.normalizeCase !== false) {
    output = output.toLowerCase();
  }
  if (options.stripSequenceNo !== false) {
    output = output
      .replace(/\b(?:no|vol|part)\.?\s*\d+\b/gi, " ")
      .replace(/^\s*\d+[-_.\s]+/g, " ");
  }
  if (options.stripDate !== false) {
    output = output.replace(/\b\d{4}([./-]\d{1,2}){1,2}\b/g, " ");
  }
  if (options.stripPageStats !== false) {
    output = output.replace(/\b\d+\s*p(?:\d+\s*v)?\b/gi, " ");
  }
  if (options.stripSizeStats !== false) {
    output = output.replace(/\b\d+(?:\.\d+)?\s*(?:kb|mb|gb|tb)\b/gi, " ");
  }
  if (options.trimSpaces !== false) {
    output = output.replace(/[_\-()[\]{}]+/g, " ").replace(/\s+/g, " ").trim();
  }
  return output;
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

const tokenizeNormalizedText = (value: string): string[] =>
  Array.from(new Set(value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}A-Za-z0-9]+/gu) ?? []));

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

const buildRuleCandidates = (rule: SmartAlbumRuleDTO): CandidateRecord[] => {
  const albums = listAlbumsForSmartRuleScopeDb();
  const matches: CandidateRecord[] = [];
  const albumCounts = new Map<string, number>();

  for (const album of albums) {
    const texts = extractScopeTexts(rule.scope, album);
    let matched = false;
    for (const rawText of texts) {
      const normalizedText = normalizeText(rawText, rule.normalizeOptions);
      for (const rawPattern of rule.patterns) {
        const normalizedPattern = normalizeText(rawPattern, rule.normalizeOptions);
        if (!normalizedPattern) {
          continue;
        }
        if (!matchPattern(rule.matchMode, normalizedText, normalizedPattern)) {
          continue;
        }

        const targetName = buildTargetName(rule, rawPattern);
        const normalizedKey = normalizeText(targetName, rule.normalizeOptions);
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

const buildHeuristicAiCandidates = (config: SmartAlbumAiConfigRecord): CandidateRecord[] => {
  const albums = listAlbumsForSmartRuleScopeDb();
  const genericNormalizeOptions: SmartAlbumRuleNormalizeOptions = {
    trimSpaces: true,
    normalizeCase: true,
    stripSequenceNo: true,
    stripDate: true,
    stripPageStats: true,
    stripSizeStats: true
  };
  const excludedTokens = new Set(
    [
      "moment",
      "写真",
      "套图",
      "合集",
      "图片",
      "中国",
      ...parseJsonArray(config.excludedTokensJson).map((item) => normalizeText(item, genericNormalizeOptions))
    ].filter(Boolean)
  );
  const tokenToAlbums = new Map<string, Set<string>>();

  for (const album of albums) {
    const normalizedName = normalizeText(album.name, genericNormalizeOptions);
    const tokens = tokenizeNormalizedText(normalizedName).filter((token) => {
      if (excludedTokens.has(token)) {
        return false;
      }
      if (/^\d+$/.test(token)) {
        return false;
      }
      return token.length >= 2;
    });

    for (const token of tokens) {
      const bucket = tokenToAlbums.get(token) ?? new Set<string>();
      bucket.add(album.id);
      tokenToAlbums.set(token, bucket);
    }
  }

  const candidates: CandidateRecord[] = [];
  for (const [token, albumIds] of tokenToAlbums.entries()) {
    if (albumIds.size < config.minClusterAlbumCount) {
      continue;
    }

    const confidence = Math.min(0.98, 0.55 + Math.min(albumIds.size, 8) * 0.06 + Math.min(token.length, 8) * 0.015);
    if (config.mode !== "full_auto" && confidence < config.minConfidenceAutoApply) {
      continue;
    }

    for (const albumId of albumIds) {
      candidates.push({
        albumId,
        normalizedKey: token,
        smartAlbumName: token,
        confidence,
        sourceEngine: "ai",
        ruleId: null,
        matchedScopes: ["albumName"],
        matchedTokens: [token],
        reason: `matched by ai-cluster:${token}`
      });
    }
  }

  return candidates;
};

const mapAiClustersToCandidates = (
  clusters: AiCluster[],
  albumMap: Map<string, { id: string; name: string }>
): CandidateRecord[] =>
  clusters.flatMap((cluster) => {
    const uniqueAlbumIds = Array.from(new Set(cluster.albumIds)).filter((albumId) => albumMap.has(albumId));
    if (uniqueAlbumIds.length < 2) {
      return [];
    }

    const normalizedName = normalizeText(cluster.name, {
      trimSpaces: true,
      normalizeCase: true
    });
    if (!normalizedName) {
      return [];
    }

    const confidence = Math.max(0, Math.min(1, Number(cluster.confidence) || 0));
    return uniqueAlbumIds.map((albumId) => ({
      albumId,
      normalizedKey: normalizedName,
      smartAlbumName: cluster.name.trim(),
      confidence,
      sourceEngine: "ai" as const,
      ruleId: null,
      matchedScopes: ["albumName"],
      matchedTokens: [cluster.name.trim()],
      reason: cluster.reason?.trim() || "matched by openai"
    }));
  });

const requestOpenAiClusters = async (
  config: SmartAlbumAiConfigRecord,
  albums: Array<{
    id: string;
    name: string;
    sourcePath: string;
    assetCount: number;
  }>
): Promise<AiCluster[]> => {
  const runtime = buildAiRuntimeConfig(config);
  if (!runtime.apiToken) {
    return [];
  }

  const text = await createOpenAiChatCompletion(
    {
      endpoint: runtime.endpoint,
      apiToken: runtime.apiToken,
      model: runtime.model
    },
    {
      messages: [
        { role: "system", content: buildAiSystemPrompt() },
        { role: "user", content: buildAiUserPrompt(albums, config.maxSuggestionsPerRun) }
      ],
      maxTokens: 2400,
      temperature: 0.1,
      timeoutMs: OPENAI_GROUPING_TIMEOUT_MS
    }
  );

  const parsed = parseJsonFromModelText<{ clusters?: AiCluster[] }>(text);
  return Array.isArray(parsed?.clusters) ? parsed.clusters : [];
};

const buildOpenAiCandidates = async (config: SmartAlbumAiConfigRecord): Promise<CandidateRecord[]> => {
  const albums = listAlbumsForSmartRuleScopeDb();
  if (albums.length < config.minClusterAlbumCount) {
    return [];
  }

  const albumMap = new Map(albums.map((album) => [album.id, album]));
  const candidates: CandidateRecord[] = [];
  for (let index = 0; index < albums.length; index += MAX_AI_ALBUMS_PER_BATCH) {
    const batch = albums.slice(index, index + MAX_AI_ALBUMS_PER_BATCH);
    const clusters = await requestOpenAiClusters(config, batch);
    candidates.push(...mapAiClustersToCandidates(clusters, albumMap));
  }

  return candidates.filter((candidate) => {
    if (config.mode === "full_auto") {
      return true;
    }
    return candidate.confidence >= config.minConfidenceAutoApply;
  });
};

const buildAiCandidates = async (): Promise<CandidateRecord[]> => {
  const config = getSmartAlbumAiConfigDb();
  if (!config.enabled) {
    return [];
  }

  const runtime = buildAiRuntimeConfig(config);
  if (!runtime.apiToken) {
    return buildHeuristicAiCandidates(config);
  }

  try {
    return await buildOpenAiCandidates(config);
  } catch (error) {
    const runtime = buildAiRuntimeConfig(config);
    console.error(
      `[smart-album-service] OpenAI grouping failed, fallback to heuristic AI: endpoint=${runtime.endpoint} model=${runtime.model} batchSize=${MAX_AI_ALBUMS_PER_BATCH} timeoutMs=${OPENAI_GROUPING_TIMEOUT_MS}`,
      error
    );
    return buildHeuristicAiCandidates(config);
  }
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

export const rebuildSmartAlbums = async (): Promise<{ smartAlbumsDiscovered: number; membersDiscovered: number }> => {
  const rules = listSmartAlbumRulesDb().filter((rule) => rule.enabled && rule.action === "assignSmartAlbum");
  const aiCandidates = await buildAiCandidates();
  const candidates = [...rules.flatMap((rule) => buildRuleCandidates(toRuleDto(rule))), ...aiCandidates]
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

export const listSmartAlbumRules = async (): Promise<SmartAlbumRuleDTO[]> => listSmartAlbumRulesDb().map(toRuleDto);

export const getSmartAlbumAiConfig = async (): Promise<SmartAlbumAiConfigDTO> => toAiConfigDto(getSmartAlbumAiConfigDb());

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
  return toAiConfigDto(updated);
};

export const testSmartAlbumAiConnection = async (input?: SmartAlbumAiConnectionTestInput): Promise<SmartAlbumAiConnectionTestDTO> => {
  const config = getSmartAlbumAiConfigDb();
  const runtime = buildAiRuntimeConfig(config, input);

  if (!runtime.apiToken) {
    return {
      success: false,
      message: "请先填写 OpenAI Token",
      endpoint: runtime.endpoint,
      model: runtime.model,
      latencyMs: 0
    };
  }

  const startedAt = Date.now();
  try {
    const text = await createOpenAiChatCompletion(
      {
        endpoint: runtime.endpoint,
        apiToken: runtime.apiToken,
        model: runtime.model
      },
      {
        messages: [
          { role: "system", content: "你是连接测试助手，请只回复 OK。" },
          { role: "user", content: "请回复 OK" }
        ],
        maxTokens: 16,
        temperature: 0,
        timeoutMs: 20000
      }
    );

    return {
      success: true,
      message: `连接成功，模型返回：${text.slice(0, 80)}`,
      endpoint: runtime.endpoint,
      model: runtime.model,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "连接测试失败",
      endpoint: runtime.endpoint,
      model: runtime.model,
      latencyMs: Date.now() - startedAt
    };
  }
};

export const testSmartAlbumRule = async (ruleId: string): Promise<SmartAlbumRuleTestResultDTO | null> => {
  const rule = findSmartAlbumRuleByIdDb(ruleId);
  if (!rule) {
    return null;
  }
  const ruleDto = toRuleDto(rule);
  const matchedAlbums = buildRuleCandidates(ruleDto)
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
