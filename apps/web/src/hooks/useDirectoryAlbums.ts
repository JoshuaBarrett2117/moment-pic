import { useCallback, useState } from 'react';
import { api } from '../lib/api';
import type { DirectoryAlbumsDTO } from '../types/api';

type FetchDirectoryAlbumsOptions = {
  libraryRootId?: string | null;
  relativePath?: string;
};

export function useDirectoryAlbums() {
  const [directoryAlbums, setDirectoryAlbums] = useState<DirectoryAlbumsDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectoryAlbums = useCallback(async (options: FetchDirectoryAlbumsOptions = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<DirectoryAlbumsDTO>('/albums/directory-tree', {
        libraryRootId: options.libraryRootId || undefined,
        relativePath: options.relativePath || undefined,
      });
      setDirectoryAlbums(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取目录相册失败');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    directoryAlbums,
    error,
    fetchDirectoryAlbums,
    isLoading,
  };
}
