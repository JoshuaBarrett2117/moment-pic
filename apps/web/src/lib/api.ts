import { clearAuthSession, notifyAuthExpired } from '../app/auth-session';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  code: number;
  message: string;
}

type ApiRequestOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

const API_BASE_URL = '/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 与原 axios 错误保持兼容的形状：调用方读取 `error.message`、`error.response.status`、
 * `error.name === 'CanceledError'` / `error.code === 'ERR_CANCELED'` 的逻辑均无需修改。
 */
export class ApiError extends Error {
  readonly response?: { status: number; data?: ApiErrorResponse };
  readonly code?: string;

  constructor(message: string, options: { status?: number; data?: ApiErrorResponse; code?: string; name?: string } = {}) {
    super(message);
    this.name = options.name ?? 'ApiError';
    this.code = options.code;
    if (options.status !== undefined) this.response = { status: options.status, data: options.data };
  }
}

const buildUrl = (url: string, params?: Record<string, unknown>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(`${key}[]`, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  const query = search.toString();
  return `${API_BASE_URL}${url}${query ? `${url.includes('?') ? '&' : '?'}${query}` : ''}`;
};

const readErrorBody = async (response: Response): Promise<ApiErrorResponse | undefined> => {
  try {
    const body = (await response.json()) as Partial<ApiErrorResponse>;
    if (body && typeof body.message === 'string') return { code: Number(body.code ?? response.status), message: body.message };
  } catch {
    // 非 JSON 响应体，忽略
  }
  return undefined;
};

class ApiClient {
  private async request<T>(method: string, url: string, init: { params?: Record<string, unknown>; data?: unknown } & ApiRequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : undefined;
    const onAbort = () => controller.abort();
    if (init.signal?.aborted) controller.abort();
    else init.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const hasBody = init.data !== undefined;
      let response: Response;
      try {
        response = await fetch(buildUrl(url, init.params), {
          method,
          credentials: 'include',
          headers: hasBody ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
          body: hasBody ? JSON.stringify(init.data) : undefined,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          if (timedOut) throw new ApiError(`请求超时（${timeoutMs}ms）`, { code: 'ECONNABORTED' });
          throw new ApiError('canceled', { name: 'CanceledError', code: 'ERR_CANCELED' });
        }
        throw new ApiError(error instanceof Error ? error.message : '网络错误', { code: 'ERR_NETWORK' });
      }

      if (!response.ok) {
        const data = await readErrorBody(response);
        if (response.status === 401 && !url.startsWith('/shares/')) {
          clearAuthSession();
          notifyAuthExpired();
        }
        throw new ApiError(data?.message ?? `Request failed with status code ${response.status}`, { status: response.status, data });
      }

      const body = (await response.json()) as ApiResponse<T>;
      return body.data;
    } finally {
      if (timer) clearTimeout(timer);
      init.signal?.removeEventListener('abort', onAbort);
    }
  }

  get<T>(url: string, params?: Record<string, unknown>, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>('GET', url, { params, signal: options?.signal });
  }

  getWithOptions<T>(url: string, params?: Record<string, unknown>, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>('GET', url, { params, ...options });
  }

  post<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>('POST', url, { data: data ?? {} });
  }

  postWithOptions<T>(url: string, data?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>('POST', url, { data: data ?? {}, ...options });
  }

  delete<T>(url: string): Promise<T> {
    return this.request<T>('DELETE', url);
  }

  patch<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>('PATCH', url, { data: data ?? {} });
  }

  put<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>('PUT', url, { data: data ?? {} });
  }
}

export const api = new ApiClient();
