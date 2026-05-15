import path from "node:path";

import { makeId } from "../repositories/ids.js";
import type { SmartAlbumRuleScopeDTO } from "../types/dto.js";
import type { SmartAlbumAiConfigRecord, SmartAlbumRuleNormalizeOptions, SmartAlbumRuleRecord } from "../types/store.js";

export type CandidateRecord = {
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

export type AiCluster = {
  name: string;
  albumIds: string[];
  confidence: number;
  reason: string;
};

export type SmartAlbumScopeAlbum = {
  id: string;
  name: string;
  sourcePath: string;
  assetCount: number;
  sourceType: "folder" | "zip";
};

export const parseJsonArray = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

export const normalizeSmartAlbumText = (input: string, options: SmartAlbumRuleNormalizeOptions): string => {
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

const tokenizeNormalizedText = (value: string): string[] =>
  Array.from(new Set(value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}A-Za-z0-9]+/gu) ?? []));

const normalizePathSegment = (value: string): string => value.replace(/\\/g, "/").replace(/\/+$/, "").trim();

const AI_TARGET_SUFFIXES = ["系列", "作品", "合集", "写真", "图集", "相关", "主题", "套图"] as const;

const isValidAiKeywordPattern = (value: string): boolean => {
  const normalized = value.trim();
  if (!normalized || /^\d+$/.test(normalized)) {
    return false;
  }

  if (/^\p{Script=Han}+$/u.test(normalized)) {
    return Array.from(normalized).length >= 2;
  }

  if (/^[A-Za-z]+(?:\s+[A-Za-z]+)+$/.test(normalized)) {
    return normalized.split(/\s+/).filter(Boolean).length >= 2;
  }

  if (/^[A-Za-z]+$/.test(normalized)) {
    return normalized.length >= 4;
  }

  return normalized.length >= 2;
};

const expandAiSemanticTokens = (tokens: string[]): string[] => {
  const expanded = new Set<string>();
  for (const token of tokens) {
    if (!token) {
      continue;
    }

    let candidate = token.trim();
    let trimmedAny = false;
    while (candidate) {
      let trimmed = false;
      for (const suffix of AI_TARGET_SUFFIXES) {
        if (!candidate.endsWith(suffix) || candidate.length <= suffix.length + 1) {
          continue;
        }
        candidate = candidate.slice(0, -suffix.length).trim();
        if (candidate) {
          expanded.add(candidate);
        }
        trimmed = true;
        trimmedAny = true;
        break;
      }
      if (!trimmed) {
        break;
      }
    }

    if (!trimmedAny) {
      expanded.add(token);
    }
  }

  return Array.from(expanded).filter(Boolean);
};

const buildAiTargetTokens = (targetName: string, normalizeOptions: SmartAlbumRuleNormalizeOptions): string[] => {
  const normalizedTargetName = normalizeSmartAlbumText(targetName, normalizeOptions);
  return expandAiSemanticTokens(
    tokenizeNormalizedText(normalizedTargetName).filter((token) => isValidAiKeywordPattern(token))
  );
};

const buildAiPathSegments = (sourcePath: string): string[] => {
  const segments = normalizePathSegment(sourcePath).split("/").filter(Boolean);
  let currentIndex = -1;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index] ?? "";
    if (!segment || /^\d+$/.test(segment)) {
      continue;
    }
    currentIndex = index;
    break;
  }

  if (currentIndex < 0) {
    return [];
  }

  const currentSegment = segments[currentIndex] ?? "";
  const parentSegment = currentIndex > 0 ? (segments[currentIndex - 1] ?? "") : "";
  return [currentSegment, parentSegment].filter(Boolean);
};

const extractAiScopeTexts = (scope: SmartAlbumRuleScopeDTO, album: SmartAlbumScopeAlbum): string[] => {
  if (scope === "albumName") {
    return [album.name];
  }
  if (scope === "sourcePath") {
    return buildAiPathSegments(album.sourcePath);
  }
  if (scope === "parentPath") {
    return buildAiPathSegments(album.sourcePath).slice(1, 2);
  }
  return [];
};

export const areAiRulePatternsAligned = (patterns: string[], targetName: string): boolean => {
  const normalizeOptions: SmartAlbumRuleNormalizeOptions = {
    trimSpaces: true,
    normalizeCase: true,
    stripSequenceNo: true,
    stripDate: true,
    stripPageStats: true,
    stripSizeStats: true
  };
  const normalizedTargetName = normalizeSmartAlbumText(targetName, normalizeOptions);
  if (!normalizedTargetName) {
    return false;
  }

  const targetTokens = new Set(buildAiTargetTokens(targetName, normalizeOptions));

  return patterns.length > 0 && patterns.every((pattern) => {
    const normalizedPattern = normalizeSmartAlbumText(pattern, normalizeOptions);
    return isValidAiKeywordPattern(normalizedPattern)
      && (normalizedPattern === normalizedTargetName || targetTokens.has(normalizedPattern));
  });
};

const buildAiScopeTokenSet = (
  album: SmartAlbumScopeAlbum,
  scope: SmartAlbumRuleScopeDTO,
  normalizeOptions: SmartAlbumRuleNormalizeOptions
): Set<string> => {
  const texts = extractAiScopeTexts(scope, album);
  const tokens = new Set<string>();

  for (const text of texts) {
    const normalized = normalizeSmartAlbumText(text, normalizeOptions);
    for (const token of expandAiSemanticTokens(tokenizeNormalizedText(normalized))) {
      if (!isValidAiKeywordPattern(token)) {
        continue;
      }
      tokens.add(token);
    }
  }

  return tokens;
};

const getPreferredAiScopes = (config?: SmartAlbumAiConfigRecord): SmartAlbumRuleScopeDTO[] => {
  const configuredScopes = config
    ? parseJsonArray(config.preferredScopesJson).filter(
        (item): item is SmartAlbumRuleScopeDTO => item === "albumName" || item === "sourcePath" || item === "parentPath"
      )
    : [];
  const fallbackScopes: SmartAlbumRuleScopeDTO[] = ["albumName", "sourcePath", "parentPath"];
  return [...configuredScopes, ...fallbackScopes].filter((scope, index, list) => list.indexOf(scope) === index);
};

const deriveAiRuleScope = (albums: SmartAlbumScopeAlbum[], config?: SmartAlbumAiConfigRecord): SmartAlbumRuleScopeDTO => {
  const normalizeOptions: SmartAlbumRuleNormalizeOptions = {
    trimSpaces: true,
    normalizeCase: true,
    stripSequenceNo: true,
    stripDate: true,
    stripPageStats: true,
    stripSizeStats: true
  };
  const scopes = getPreferredAiScopes(config);
  let bestScope: SmartAlbumRuleScopeDTO = "albumName";
  let bestScore = -1;

  for (const scope of scopes) {
    const tokenCounts = new Map<string, number>();
    for (const album of albums) {
      for (const token of buildAiScopeTokenSet(album, scope, normalizeOptions)) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      }
    }

    const score = Array.from(tokenCounts.values()).filter((count) => count >= 2).length;
    if (score > 0 && scope === scopes[0]) {
      return scope;
    }
    if (score > bestScore) {
      bestScope = scope;
      bestScore = score;
    }
  }

  return bestScope;
};

export const buildRulePatternsFromAlbums = (
  albums: SmartAlbumScopeAlbum[],
  scope: SmartAlbumRuleScopeDTO,
  config: SmartAlbumAiConfigRecord,
  targetName?: string
): string[] => {
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
      ...parseJsonArray(config.excludedTokensJson).map((item) => normalizeSmartAlbumText(item, genericNormalizeOptions))
    ].filter(Boolean)
  );
  const tokenToAlbums = new Map<string, Set<string>>();
  const targetTokens = targetName
    ? buildAiTargetTokens(targetName, genericNormalizeOptions)
        .filter((token) => !excludedTokens.has(token))
    : [];

  for (const album of albums) {
    for (const token of buildAiScopeTokenSet(album, scope, genericNormalizeOptions)) {
      if (excludedTokens.has(token)) {
        continue;
      }
      const bucket = tokenToAlbums.get(token) ?? new Set<string>();
      bucket.add(album.id);
      tokenToAlbums.set(token, bucket);
    }
  }

  const prioritizedTargetTokens = targetTokens
    .filter((token, index, list) => list.indexOf(token) === index)
    .filter((token) => (tokenToAlbums.get(token)?.size ?? 0) >= config.minClusterAlbumCount);

  if (prioritizedTargetTokens.length > 0) {
    return prioritizedTargetTokens;
  }

  return Array.from(tokenToAlbums.entries())
    .filter(([, albumIds]) => albumIds.size >= config.minClusterAlbumCount)
    .sort((left, right) => {
      const coverageDiff = right[1].size - left[1].size;
      if (coverageDiff !== 0) {
        return coverageDiff;
      }
      return right[0].length - left[0].length;
    })
    .map(([token]) => token);
};

export const buildHeuristicAiCandidates = (config: SmartAlbumAiConfigRecord, albums: SmartAlbumScopeAlbum[]): CandidateRecord[] => {
  const scope = deriveAiRuleScope(albums, config);
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
      ...parseJsonArray(config.excludedTokensJson).map((item) => normalizeSmartAlbumText(item, genericNormalizeOptions))
    ].filter(Boolean)
  );
  const tokenToAlbums = new Map<string, Set<string>>();

  for (const album of albums) {
    const tokens = Array.from(buildAiScopeTokenSet(album, scope, genericNormalizeOptions)).filter((token) => !excludedTokens.has(token));
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

export const mapAiClustersToCandidates = (
  clusters: AiCluster[],
  albumMap: Map<string, SmartAlbumScopeAlbum>
): CandidateRecord[] =>
  clusters.flatMap((cluster) => {
    const uniqueAlbumIds = Array.from(new Set(cluster.albumIds)).filter((albumId) => albumMap.has(albumId));
    if (uniqueAlbumIds.length < 2) {
      return [];
    }

    const normalizedName = normalizeSmartAlbumText(cluster.name, {
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

export const buildSmartAlbumRuleRecords = (
  candidates: CandidateRecord[],
  albums: SmartAlbumScopeAlbum[],
  runId: string,
  config: SmartAlbumAiConfigRecord
): SmartAlbumRuleRecord[] => {
  const grouped = new Map<string, CandidateRecord[]>();
  for (const candidate of candidates) {
    const current = grouped.get(candidate.normalizedKey) ?? [];
    current.push(candidate);
    grouped.set(candidate.normalizedKey, current);
  }

  const albumMap = new Map(albums.map((album) => [album.id, album]));
  const timestamp = new Date().toISOString();

  const rawRules = Array.from(grouped.entries()).flatMap(([normalizedKey, items]) => {
    const albumRows = Array.from(new Set(items.map((item) => item.albumId))).map((albumId) => albumMap.get(albumId)).filter((item): item is SmartAlbumScopeAlbum => Boolean(item));
    if (albumRows.length < 2) {
      return [];
    }

    const scope = deriveAiRuleScope(albumRows, config);
    const targetName = items[0]?.smartAlbumName?.trim() || normalizedKey;
    const patterns = buildRulePatternsFromAlbums(albumRows, scope, config, targetName).slice(0, 5);
    const normalizedPatterns = (patterns.length > 0 ? patterns : [targetName]).filter((pattern) => isValidAiKeywordPattern(pattern));
    if (!areAiRulePatternsAligned(normalizedPatterns, targetName)) {
      return [];
    }
    const confidence = Math.max(0, Math.min(1, Number(items.reduce((sum, item) => sum + item.confidence, 0) / items.length) || 0));

    const createdRule: SmartAlbumRuleRecord = {
      id: makeId("sar"),
      name: `AI生成：${targetName}`,
      enabled: true,
      sourceEngine: "ai",
      priority: 20,
      scope,
      matchMode: "contains",
      patternsJson: JSON.stringify(Array.from(new Set(normalizedPatterns))),
      normalizeOptionsJson: JSON.stringify({
        trimSpaces: true,
        normalizeCase: true,
        stripSequenceNo: true,
        stripDate: true,
        stripPageStats: true,
        stripSizeStats: true
      }),
      action: "assignSmartAlbum",
      targetName,
      targetNameTemplate: null,
      minAlbumCount: Math.max(2, albumRows.length),
      minConfidence: confidence,
      generatedNormalizedKey: normalizedKey,
      generatedConfidence: confidence,
      generatedReason: `generated from ai run ${runId}`,
      generatedRunId: runId,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    return [createdRule];
  });

  const mergedRules = new Map<string, SmartAlbumRuleRecord>();
  for (const rule of rawRules) {
    const patterns = parseJsonArray(rule.patternsJson);
    const mergeKey = JSON.stringify([...patterns].sort());
    const existing = mergedRules.get(mergeKey);
    if (!existing) {
      mergedRules.set(mergeKey, rule);
      continue;
    }

    const shouldReplace = rule.minAlbumCount > existing.minAlbumCount
      || (rule.minAlbumCount === existing.minAlbumCount && rule.minConfidence > existing.minConfidence)
      || (
        rule.minAlbumCount === existing.minAlbumCount
        && rule.minConfidence === existing.minConfidence
        && (rule.targetName?.length ?? 0) < (existing.targetName?.length ?? 0)
      );
    if (shouldReplace) {
      mergedRules.set(mergeKey, rule);
    }
  }

  return Array.from(mergedRules.values());
};
