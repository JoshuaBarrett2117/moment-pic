import net from "node:net";

const isPrivateHost = (hostname: string): boolean => {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".internal")) return true;
  if (net.isIPv4(host)) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(host)) return host === "::1" || host.startsWith("fc") || host.startsWith("fd");
  return false;
};

/**
 * AI 接口地址校验：只允许 http(s)，不允许携带账号密码；
 * 公网地址必须 https（防止 token 明文传输），局域网/本机（如 Ollama）允许 http。
 */
export const validateAiEndpoint = (endpoint: string): string => {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw Object.assign(new Error("AI 接口地址不是合法的 URL"), { statusCode: 400 });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw Object.assign(new Error("AI 接口地址只支持 http/https"), { statusCode: 400 });
  if (url.username || url.password) throw Object.assign(new Error("AI 接口地址不能包含账号密码，请填写到 API Token"), { statusCode: 400 });
  if (url.protocol === "http:" && !isPrivateHost(url.hostname)) throw Object.assign(new Error("公网 AI 接口必须使用 https"), { statusCode: 400 });
  return endpoint;
};
