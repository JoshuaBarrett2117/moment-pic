import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { LibraryRootDTO } from '../types/api';

interface UseLibraryRootsReturn {
  libraryRoots: LibraryRootDTO[];
  isLoading: boolean;
  error: string | null;
  fetchLibraryRoots: () => Promise<void>;
  addLibraryRoot: (path: string, name?: string) => Promise<LibraryRootDTO | null>;
  updateLibraryRoot: (id: string, updates: { name?: string; path?: string; enabled?: boolean }) => Promise<LibraryRootDTO | null>;
  deleteLibraryRoot: (id: string) => Promise<boolean>;
}

export function useLibraryRoots(): UseLibraryRootsReturn {
  const [libraryRoots, setLibraryRoots] = useState<LibraryRootDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLibraryRoots = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<LibraryRootDTO[]>('/library-roots');
      setLibraryRoots(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取库目录失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addLibraryRoot = useCallback(async (path: string, name?: string): Promise<LibraryRootDTO | null> => {
    try {
      const result = await api.post<LibraryRootDTO>('/library-roots', { path, name });
      setLibraryRoots(prev => [...prev, result]);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加库目录失败');
      return null;
    }
  }, []);

  const deleteLibraryRoot = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.delete(`/library-roots/${id}`);
      setLibraryRoots(prev => prev.filter(r => r.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除库目录失败');
      return false;
    }
  }, []);

  const updateLibraryRoot = useCallback(async (id: string, updates: { name?: string; path?: string; enabled?: boolean }): Promise<LibraryRootDTO | null> => {
    try {
      const result = await api.patch<LibraryRootDTO>(`/library-roots/${id}`, updates);
      setLibraryRoots(prev => prev.map(r => r.id === id ? result : r));
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新库目录失败');
      return null;
    }
  }, []);

  return { libraryRoots, isLoading, error, fetchLibraryRoots, addLibraryRoot, updateLibraryRoot, deleteLibraryRoot };
}
