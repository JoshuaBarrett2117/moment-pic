import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlbumProgressDTO, AssetListItemDTO } from '../types/api';
import { albumProgressApi, createProgressSaver, getProgressPage, READER_PAGE_SIZE, resolveProgressItemIndex } from '../lib/album-progress';

type ReaderSession = { key: number; items: AssetListItemDTO[]; initialIndex: number; firstPage: number; lastPage: number; total: number };
const MAX_READER_ITEMS = READER_PAGE_SIZE * 3;

export const useAlbumReader = (albumId: string, enabled = true) => {
  const [session, setSession] = useState<ReaderSession | null>(null);
  const sessionRef = useRef<ReaderSession | null>(null);
  const [progress, setProgress] = useState<AlbumProgressDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const loadingPage = useRef(false);
  const saver = useMemo(() => createProgressSaver((position) => enabled ? albumProgressApi.save(albumId, position) : Promise.resolve()), [albumId, enabled]);

  const open = useCallback(async (assetId: string, assetIndex: number): Promise<boolean> => {
    const version = ++generation.current;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError(null); loadingPage.current = false;
    try {
      const page = getProgressPage(assetIndex);
      const result = await albumProgressApi.page(albumId, page, request.signal);
      if (generation.current !== version) return false;
      const index = resolveProgressItemIndex(result.items, { assetId, assetIndex });
      if (index === null) throw new Error('原阅读图片已变化，请从网格重新选择');
      const next = { key: version, items: result.items, initialIndex: index, firstPage: page, lastPage: page, total: result.pagination.total };
      sessionRef.current = next; setSession(next);
      return true;
    } catch {
      if (generation.current === version) setError('读取进度对应图片失败，请从网格重新选择');
      return false;
    } finally { if (generation.current === version) setLoading(false); }
  }, [albumId]);

  useEffect(() => {
    const version = ++generation.current;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    sessionRef.current = null; setSession(null); setProgress(null); setError(null); setLoading(false);
    if (enabled && albumId) void albumProgressApi.get(albumId, request.signal).then((value) => {
      if (generation.current !== version) return;
      setProgress(value);
      if (value) void open(value.assetId, value.assetIndex);
    }).catch(() => undefined);
    return () => { generation.current++; controller.current?.abort(); void saver.flush(); };
  }, [albumId, enabled, open, saver]);

  const loadPage = useCallback(async (direction: 'previous' | 'next'): Promise<boolean> => {
    const current = sessionRef.current;
    if (!current || loadingPage.current) return false;
    const page = direction === 'previous' ? current.firstPage - 1 : current.lastPage + 1;
    if (page < 1 || (page - 1) * READER_PAGE_SIZE >= current.total) return false;
    const version = generation.current;
    loadingPage.current = true; setLoading(true);
    try {
      const result = await albumProgressApi.page(albumId, page, controller.current?.signal);
      if (generation.current !== version || !result.items.length) return false;
      let items = direction === 'previous' ? [...result.items, ...current.items] : [...current.items, ...result.items];
      let firstPage = direction === 'previous' ? page : current.firstPage;
      let lastPage = direction === 'next' ? page : current.lastPage;
      if (items.length > MAX_READER_ITEMS) {
        if (direction === 'next') { items = items.slice(READER_PAGE_SIZE); firstPage++; }
        else { items = items.slice(0, MAX_READER_ITEMS); lastPage--; }
      }
      const next = { ...current, items, firstPage, lastPage, total: result.pagination.total };
      sessionRef.current = next; setSession(next);
      return true;
    } catch { if (generation.current === version) setError('图片加载失败，请重试'); return false; }
    finally { if (generation.current === version) { loadingPage.current = false; setLoading(false); } }
  }, [albumId]);

  const savePosition = useCallback((assetId: string, assetIndex: number) => {
    if (enabled) saver.schedule({ assetId, assetIndex });
  }, [enabled, saver]);
  const close = useCallback(() => {
    void saver.flush(); generation.current++; controller.current?.abort();
    sessionRef.current = null; setSession(null); setLoading(false); loadingPage.current = false;
  }, [saver]);
  const loadNext = useCallback(() => loadPage('next'), [loadPage]);
  const loadPrevious = useCallback(() => loadPage('previous'), [loadPage]);

  return { session, progress, loading, error, open, close, savePosition, loadNext, loadPrevious,
    hasNext: Boolean(session && session.lastPage * READER_PAGE_SIZE < session.total), hasPrevious: Boolean(session && session.firstPage > 1) };
};
