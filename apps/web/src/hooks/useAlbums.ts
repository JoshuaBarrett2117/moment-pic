import { useLatestRequest, isRequestCancellation } from './useLatestRequest';
import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { AlbumFavoriteDTO, AlbumShareDTO, AlbumsListDTO, AlbumAssetsDTO, ManagedAlbumSharesDTO, RecentAlbumsDTO, AlbumListItemDTO, SharedAlbumAuthDTO } from '../types/api';

interface UseAlbumsOptions {
  page?: number;
  pageSize?: number;
  keyword?: string;
  libraryRootId?: string;
  sourceType?: 'folder' | 'zip';
  sortBy?: 'name' | 'updatedAt' | 'assetCount';
  sortOrder?: 'asc' | 'desc';
  favoriteOnly?: boolean;
}

interface UseAlbumsReturn {
  cancelRequests: () => void;
  albums: AlbumsListDTO | null;
  isLoading: boolean;
  error: string | null;
  fetchAlbums: (options?: UseAlbumsOptions) => Promise<void>;
}

export function useAlbums(): UseAlbumsReturn {
  const requests = useLatestRequest();
  const [albums, setAlbums] = useState<AlbumsListDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlbums = useCallback(async (options: UseAlbumsOptions = {}): Promise<void> => {
    const request = requests.begin();
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options.page) params.append('page', String(options.page));
      if (options.pageSize) params.append('pageSize', String(options.pageSize));
      if (options.keyword) params.append('keyword', options.keyword);
      if (options.libraryRootId) params.append('libraryRootId', options.libraryRootId);
      if (options.sourceType) params.append('sourceType', options.sourceType);
      if (options.sortBy) params.append('sortBy', options.sortBy);
      if (options.sortOrder) params.append('sortOrder', options.sortOrder);
      if (options.favoriteOnly) params.append('favoriteOnly', 'true');

      const query = params.toString() ? `?${params.toString()}` : '';
      const result = await api.get<AlbumsListDTO>(`/albums${query}`, undefined, { signal: request.signal });
      if (!request.isCurrent()) return;
      setAlbums(result);
    } catch (err) {
      if (request.isCurrent() && !isRequestCancellation(err)) setError(err instanceof Error ? err.message : '获取相册失败');
    } finally {
      if (request.isCurrent()) setIsLoading(false);
    }
  }, []);

  return { cancelRequests: requests.cancel, albums, isLoading, error, fetchAlbums };
}

interface UseAlbumAssetsOptions {
  page?: number;
  pageSize?: number;
}

interface UseAlbumAssetsReturn {
  cancelRequests: () => void;
  assets: AlbumAssetsDTO | null;
  isLoading: boolean;
  error: string | null;
  fetchAssets: (albumId: string, options?: UseAlbumAssetsOptions) => Promise<AlbumAssetsDTO | null>;
}

export function useAlbumAssets(): UseAlbumAssetsReturn {
  const requests = useLatestRequest();
  const [assets, setAssets] = useState<AlbumAssetsDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = useCallback(async (albumId: string, options: UseAlbumAssetsOptions = {}): Promise<AlbumAssetsDTO | null> => {
    const request = requests.begin();
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options.page) params.append('page', String(options.page));
      if (options.pageSize) params.append('pageSize', String(options.pageSize));

      const query = params.toString() ? `?${params.toString()}` : '';
      const result = await api.get<AlbumAssetsDTO>(`/albums/${albumId}/assets${query}`, undefined, { signal: request.signal });
      if (!request.isCurrent()) return null;
      setAssets(result);
      return result;
    } catch (err) {
      if (request.isCurrent() && !isRequestCancellation(err)) setError(err instanceof Error ? err.message : '获取图片失败');
      return null;
    } finally {
      if (request.isCurrent()) setIsLoading(false);
    }
  }, []);

  return { cancelRequests: requests.cancel, assets, isLoading, error, fetchAssets };
}

export const deleteAlbum = async (albumId: string): Promise<boolean> => {
  try {
    await api.delete<{ success: boolean }>(`/albums/${albumId}`);
    return true;
  } catch {
    return false;
  }
};

export const deleteAsset = async (assetId: string): Promise<boolean> => {
  try {
    await api.delete<{ success: boolean }>(`/assets/${assetId}`);
    return true;
  } catch {
    return false;
  }
};

export const recordAlbumView = async (albumId: string): Promise<boolean> => {
  try {
    await api.post<{ success: boolean }>(`/albums/${albumId}/view`, undefined);
    return true;
  } catch {
    return false;
  }
};

export const rescanAlbum = async (albumId: string): Promise<boolean> => {
  try {
    await api.post<{ albumId: string; name: string; assetCount: number }>(`/albums/${albumId}/rescan`, {});
    return true;
  } catch {
    return false;
  }
};

export const setAlbumFavorite = async (albumId: string, isFavorite: boolean): Promise<AlbumFavoriteDTO | null> => {
  try {
    return await api.patch<AlbumFavoriteDTO>(`/albums/${albumId}/favorite`, { isFavorite });
  } catch {
    return null;
  }
};

export const createAlbumShare = async (
  albumId: string,
  input: {
    password: string;
    expiresAt: string;
  }
): Promise<AlbumShareDTO | null> => {
  try {
    return await api.post<AlbumShareDTO>(`/albums/${albumId}/share`, input);
  } catch {
    return null;
  }
};

export const authenticateAlbumShare = async (token: string, password: string): Promise<SharedAlbumAuthDTO | null> => {
  try {
    return await api.post<SharedAlbumAuthDTO>(`/shares/${token}/auth`, { password });
  } catch {
    return null;
  }
};

export const fetchSharedAlbumAssets = async (
  token: string,
  accessToken: string,
  options: UseAlbumAssetsOptions = {}
): Promise<AlbumAssetsDTO | null> => {
  try {
    const params = new URLSearchParams();
    params.append('accessToken', accessToken);
    if (options.page) params.append('page', String(options.page));
    if (options.pageSize) params.append('pageSize', String(options.pageSize));

    const query = params.toString() ? `?${params.toString()}` : '';
    return await api.get<AlbumAssetsDTO>(`/shares/${token}/assets${query}`);
  } catch {
    return null;
  }
};

export const fetchManagedAlbumShares = async (): Promise<ManagedAlbumSharesDTO | null> => {
  try {
    return await api.get<ManagedAlbumSharesDTO>('/album-shares');
  } catch {
    return null;
  }
};

export const deleteManagedAlbumShare = async (shareId: string): Promise<boolean> => {
  try {
    await api.delete<{ success: boolean }>(`/album-shares/${shareId}`);
    return true;
  } catch {
    return false;
  }
};

export const resetManagedAlbumSharePassword = async (shareId: string, password: string): Promise<void> => {
  await api.post(`/album-shares/${shareId}/password`, { password });
};

interface UseRecentAlbumsOptions {
  limit?: number;
}

interface UseRecentAlbumsReturn {
  cancelRequests: () => void;
  recentAlbums: AlbumListItemDTO[] | null;
  isLoading: boolean;
  error: string | null;
  fetchRecentAlbums: (options?: UseRecentAlbumsOptions) => Promise<void>;
}

export function useRecentAlbums(): UseRecentAlbumsReturn {
  const requests = useLatestRequest();
  const [recentAlbums, setRecentAlbums] = useState<AlbumListItemDTO[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecentAlbums = useCallback(async (options: UseRecentAlbumsOptions = {}): Promise<void> => {
    const request = requests.begin();
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options.limit) params.append('limit', String(options.limit));

      const query = params.toString() ? `?${params.toString()}` : '';
      const result = await api.get<RecentAlbumsDTO>(`/albums/recent${query}`, undefined, { signal: request.signal });
      if (!request.isCurrent()) return;
      setRecentAlbums(result.items);
    } catch (err) {
      if (request.isCurrent() && !isRequestCancellation(err)) setError(err instanceof Error ? err.message : '获取近期查看失败');
    } finally {
      if (request.isCurrent()) setIsLoading(false);
    }
  }, []);

  return { cancelRequests: requests.cancel, recentAlbums, isLoading, error, fetchRecentAlbums };
}
