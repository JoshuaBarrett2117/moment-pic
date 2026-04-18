import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { AlbumsListDTO, AlbumAssetsDTO, RecentAlbumsDTO, AlbumListItemDTO } from '../types/api';

interface UseAlbumsOptions {
  page?: number;
  pageSize?: number;
  keyword?: string;
  libraryRootId?: string;
  sourceType?: 'folder' | 'zip';
  sortBy?: 'name' | 'updatedAt' | 'assetCount';
  sortOrder?: 'asc' | 'desc';
}

interface UseAlbumsReturn {
  albums: AlbumsListDTO | null;
  isLoading: boolean;
  error: string | null;
  fetchAlbums: (options?: UseAlbumsOptions) => Promise<void>;
}

export function useAlbums(): UseAlbumsReturn {
  const [albums, setAlbums] = useState<AlbumsListDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlbums = useCallback(async (options: UseAlbumsOptions = {}): Promise<void> => {
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

      const query = params.toString() ? `?${params.toString()}` : '';
      const result = await api.get<AlbumsListDTO>(`/albums${query}`);
      setAlbums(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取相册失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { albums, isLoading, error, fetchAlbums };
}

interface UseAlbumAssetsOptions {
  page?: number;
  pageSize?: number;
}

interface UseAlbumAssetsReturn {
  assets: AlbumAssetsDTO | null;
  isLoading: boolean;
  error: string | null;
  fetchAssets: (albumId: string, options?: UseAlbumAssetsOptions) => Promise<AlbumAssetsDTO | null>;
}

export function useAlbumAssets(): UseAlbumAssetsReturn {
  const [assets, setAssets] = useState<AlbumAssetsDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = useCallback(async (albumId: string, options: UseAlbumAssetsOptions = {}): Promise<AlbumAssetsDTO | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options.page) params.append('page', String(options.page));
      if (options.pageSize) params.append('pageSize', String(options.pageSize));

      const query = params.toString() ? `?${params.toString()}` : '';
      const result = await api.get<AlbumAssetsDTO>(`/albums/${albumId}/assets${query}`);
      setAssets(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取图片失败');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { assets, isLoading, error, fetchAssets };
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

interface UseRecentAlbumsOptions {
  limit?: number;
}

interface UseRecentAlbumsReturn {
  recentAlbums: AlbumListItemDTO[] | null;
  isLoading: boolean;
  error: string | null;
  fetchRecentAlbums: (options?: UseRecentAlbumsOptions) => Promise<void>;
}

export function useRecentAlbums(): UseRecentAlbumsReturn {
  const [recentAlbums, setRecentAlbums] = useState<AlbumListItemDTO[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecentAlbums = useCallback(async (options: UseRecentAlbumsOptions = {}): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options.limit) params.append('limit', String(options.limit));

      const query = params.toString() ? `?${params.toString()}` : '';
      const result = await api.get<RecentAlbumsDTO>(`/albums/recent${query}`);
      setRecentAlbums(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取近期查看失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { recentAlbums, isLoading, error, fetchRecentAlbums };
}
