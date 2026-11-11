import { api, ApiError } from './api';

export type UserBackgroundDTO = {
  url: string;
  version: string;
  width: number;
  height: number;
  bytes: number;
  updatedAt: string;
};

export const BACKGROUND_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const BACKGROUND_MAX_BYTES = 15 * 1024 * 1024;

/** 上传前在浏览器里先做一次校验，给出明确提示。 */
export const validateBackgroundFile = (file: { type: string; size: number }): string | null => {
  if (!BACKGROUND_UPLOAD_TYPES.includes(file.type)) return '只支持 JPG、PNG、WebP 或 AVIF 图片';
  if (file.size > BACKGROUND_MAX_BYTES) return '图片不能超过 15 MB';
  return null;
};

export const userBackgroundApi = {
  meta: (signal?: AbortSignal) => api.get<UserBackgroundDTO | null>('/account/background/meta', undefined, { signal }),
  remove: () => api.delete<{ removed: boolean }>('/account/background'),
  /** 直接上传图片二进制（服务端统一转成 WebP、去掉 EXIF 并限制尺寸）。 */
  upload: async (file: Blob): Promise<UserBackgroundDTO> => {
    const response = await fetch('/api/v1/account/background', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': file.type, Accept: 'application/json' },
      body: file,
    });
    const body = (await response.json().catch(() => null)) as { data?: UserBackgroundDTO; message?: string } | null;
    if (!response.ok || !body?.data) {
      throw new ApiError(body?.message ?? `上传失败（${response.status}）`, { status: response.status });
    }
    return body.data;
  },
};
