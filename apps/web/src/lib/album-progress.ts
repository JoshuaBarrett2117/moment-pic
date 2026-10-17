import { api } from './api';
import type { AlbumAssetsDTO, AlbumProgressDTO, AssetListItemDTO, ContinueReadingDTO } from '../types/api';

export const READER_PAGE_SIZE = 24;
export const getProgressPage = (assetIndex: number): number => Math.floor(Math.max(0, assetIndex) / READER_PAGE_SIZE) + 1;
export const resolveProgressItemIndex = (items: Pick<AssetListItemDTO, 'id' | 'sortIndex'>[], progress: Pick<AlbumProgressDTO, 'assetId' | 'assetIndex'>): number | null => {
  const index = items.findIndex((item) => item.id === progress.assetId);
  return index >= 0 ? index : null;
};

export const albumProgressApi = {
  get: (albumId: string, signal?: AbortSignal): Promise<AlbumProgressDTO | null> => api.get(`/albums/${albumId}/progress`, undefined, { signal }),
  save: (albumId: string, progress: { assetId: string; assetIndex: number }): Promise<AlbumProgressDTO> => api.put(`/albums/${albumId}/progress`, progress),
  continue: (signal?: AbortSignal): Promise<{ items: ContinueReadingDTO[] }> => api.get('/albums/continue', { limit: 20 }, { signal }),
  page: (albumId: string, page: number, signal?: AbortSignal): Promise<AlbumAssetsDTO> => api.get(`/albums/${albumId}/assets`, { page, pageSize: READER_PAGE_SIZE }, { signal }),
};

type ReadingPosition = { assetId: string; assetIndex: number };
/** 串行写入避免慢请求覆盖新位置，失败静默；关闭查看器时可 flush 最新页。 */
export const createProgressSaver = (save: (position: ReadingPosition) => Promise<unknown>, debounceMs = 2000) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: ReadingPosition | null = null;
  let queue = Promise.resolve();
  const flush = (): Promise<void> => {
    clearTimeout(timer);
    const position = pending;
    pending = null;
    if (position) queue = queue.then(() => save(position)).then(() => undefined, () => undefined);
    return queue;
  };
  return {
    schedule(position: ReadingPosition): void { pending = position; clearTimeout(timer); timer = setTimeout(() => { void flush(); }, debounceMs); },
    flush,
    cancel(): void { clearTimeout(timer); pending = null; },
  };
};
