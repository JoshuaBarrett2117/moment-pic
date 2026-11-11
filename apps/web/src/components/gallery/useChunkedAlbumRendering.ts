import { useEffect, useMemo, useRef, useState } from 'react';

const RENDER_CHUNK_SIZE = 72;

/**
 * 大列表分批渲染。列表变成另一组数据（首项变化）时回到第一批；
 * 无限滚动追加时保留已渲染的条目，返回列表时也能恢复滚动位置。
 */
export function useChunkedAlbumRendering<T extends { id: string }>(items: T[]) {
  const firstId = items[0]?.id ?? '';
  const [state, setState] = useState(() => ({ firstId, visibleCount: Math.max(RENDER_CHUNK_SIZE, items.length) }));
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const visibleCount = state.firstId === firstId ? state.visibleCount : RENDER_CHUNK_SIZE;

  useEffect(() => {
    if (state.firstId !== firstId) setState({ firstId, visibleCount: RENDER_CHUNK_SIZE });
  }, [firstId, state.firstId]);

  const renderedItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  useEffect(() => {
    if (!loadMoreRef.current || visibleCount >= items.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setState((prev) => ({ firstId, visibleCount: Math.min((prev.firstId === firstId ? prev.visibleCount : RENDER_CHUNK_SIZE) + RENDER_CHUNK_SIZE, items.length) }));
      },
      { root: null, rootMargin: '240px 0px', threshold: 0.01 },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [firstId, items.length, visibleCount]);

  return {
    loadMoreRef,
    renderedItems,
    hasMoreItems: renderedItems.length < items.length,
  };
}
