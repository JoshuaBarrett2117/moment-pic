import path from "node:path";

import { createLogger } from "../lib/logger.js";
import type { SmartAlbumAiConnectionTestDTO } from "../types/dto.js";
import type { SmartAlbumAiConfigRecord } from "../types/store.js";
import {
  createOpenAiChatCompletion,
  normalizeOpenAiEndpoint,
  parseJsonFromModelText
} from "./openai-compatible-service.js";
import {
  buildHeuristicAiCandidates,
  mapAiClustersToCandidates,
  type AiCluster,
  type CandidateRecord,
  type SmartAlbumScopeAlbum
} from "./smart-album-ai-rule-builder.js";
import { DEFAULT_OPENAI_MODEL } from "./smart-album-mappers.js";

const logger = createLogger("SmartAlbumAiCandidates");

const MAX_AI_ALBUMS_PER_BATCH = 40;
const OPENAI_GROUPING_TIMEOUT_MS = 90000;

export type SmartAlbumAiConnectionTestInput = {
  provider?: "openai";
  apiEndpoint?: string;
  apiModel?: string;
  apiToken?: string | null;
};

export const buildAiRuntimeConfig = (
  config: SmartAlbumAiConfigRecord,
  overrides?: SmartAlbumAiConnectionTestInput
) => {
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

export const buildAiPromptAlbums = (
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

export const buildAiSystemPrompt = () => [
  "你是一个本地图库自动归纳助手。",
  "请基于用户自己的图集内容，把明显属于同一人物、作者、系列、品牌或作品线的多个普通图集归纳到同一个自动整理下。",
  "不要写死示例名称，不要臆造不存在的主体，不要输出单图集分组。",
  "只有在你高度确信多个图集确实属于同一主题时才分组。",
  "请严格返回 JSON，不要输出解释性文本。"
].join("");

export const buildAiUserPrompt = (
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

const requestOpenAiClusters = async (
  config: SmartAlbumAiConfigRecord,
  albums: SmartAlbumScopeAlbum[]
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

const buildOpenAiCandidates = async (
  config: SmartAlbumAiConfigRecord,
  albums: SmartAlbumScopeAlbum[]
): Promise<CandidateRecord[]> => {
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

  return candidates.filter((candidate) => candidate.confidence > 0);
};

export const buildAiCandidates = async (
  config: SmartAlbumAiConfigRecord,
  albums: SmartAlbumScopeAlbum[]
): Promise<CandidateRecord[]> => {
  if (!config.enabled) {
    return [];
  }

  const runtime = buildAiRuntimeConfig(config);
  if (!runtime.apiToken) {
    return buildHeuristicAiCandidates(config, albums);
  }

  try {
    return await buildOpenAiCandidates(config, albums);
  } catch (error) {
    const runtime = buildAiRuntimeConfig(config);
    logger.error(
      `OpenAI 分组失败，回退到启发式智能相册：endpoint=${runtime.endpoint} model=${runtime.model} batchSize=${MAX_AI_ALBUMS_PER_BATCH} timeoutMs=${OPENAI_GROUPING_TIMEOUT_MS}`,
      error
    );
    return buildHeuristicAiCandidates(config, albums);
  }
};

export const testSmartAlbumAiProviderConnection = async (
  config: SmartAlbumAiConfigRecord,
  input?: SmartAlbumAiConnectionTestInput
): Promise<SmartAlbumAiConnectionTestDTO> => {
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
