const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1";

type OpenAiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenAiCompatibleConfig = {
  endpoint: string;
  apiToken: string;
  model: string;
};

type OpenAiChatCompletionOptions = {
  messages: OpenAiChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

const stripCodeFence = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
};

const readMessageContent = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (typeof item === "object" && item && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

export const normalizeOpenAiEndpoint = (endpoint: string | null | undefined): string => {
  const trimmed = endpoint?.trim();
  if (!trimmed) {
    return DEFAULT_OPENAI_ENDPOINT;
  }
  return trimmed.replace(/\/+$/, "");
};

const buildChatCompletionsUrl = (endpoint: string): string => {
  if (/\/chat\/completions$/i.test(endpoint) || /\/responses$/i.test(endpoint)) {
    return endpoint;
  }
  return `${endpoint}/chat/completions`;
};

export const parseJsonFromModelText = <T>(text: string): T | null => {
  const normalized = stripCodeFence(text);
  try {
    return JSON.parse(normalized) as T;
  } catch {
    const objectStart = normalized.indexOf("{");
    const objectEnd = normalized.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(normalized.slice(objectStart, objectEnd + 1)) as T;
      } catch {
      }
    }
  }
  return null;
};

export const createOpenAiChatCompletion = async (
  config: OpenAiCompatibleConfig,
  options: OpenAiChatCompletionOptions
): Promise<string> => {
  const endpoint = normalizeOpenAiEndpoint(config.endpoint);
  const url = buildChatCompletionsUrl(endpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiToken}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: options.messages,
        max_tokens: options.maxTokens ?? 1200,
        temperature: options.temperature ?? 0.2
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenAI 接口请求失败（${response.status}）：${detail || response.statusText}`);
    }

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: unknown;
        };
      }>;
    };

    const text = readMessageContent(payload.choices?.[0]?.message?.content);
    if (!text.trim()) {
      throw new Error("OpenAI 接口未返回有效内容");
    }

    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
};

