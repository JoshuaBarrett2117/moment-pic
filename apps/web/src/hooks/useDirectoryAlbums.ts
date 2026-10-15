import { useLatestRequest, isRequestCancellation } from './useLatestRequest';
import { useCallback, useState } from 'react';
import { api } from '../lib/api';
import type { DirectoryAlbumsDTO } from '../types/api';

type FetchDirectoryAlbumsOptions = {
  libraryRootId?: string | null;
  relativePath?: string;
};

export function useDirectoryAlbums() {
  const requests = useLatestRequest();
  const [directoryAlbums, setDirectoryAlbums] = useState<DirectoryAlbumsDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectoryAlbums = useCallback(async (options: FetchDirectoryAlbumsOptions = {}) => {
    const request = requests.begin();
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<DirectoryAlbumsDTO>('/albums/directory-tree', {
        libraryRootId: options.libraryRootId || undefined,
        relativePath: options.relativePath || undefined,
      }, { signal: request.signal });
      if (!request.isCurrent()) return null;
      setDirectoryAlbums(result);
      return result;
    } catch (err) {
      if (request.isCurrent() && !isRequestCancellation(err)) setError(err instanceof Error ? err.message : '获取目录相册失败');
      return null;
    } finally {
      if (request.isCurrent()) setIsLoading(false);
    }
  }, []);

  return {
    cancelRequests: requests.cancel,
    directoryAlbums,
    error,
    fetchDirectoryAlbums,
    isLoading,
  };
}
