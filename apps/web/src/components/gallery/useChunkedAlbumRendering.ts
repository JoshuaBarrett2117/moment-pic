import { useEffect, useMemo, useRef, useState } from 'react';

const RENDER_CHUNK_SIZE = 72;

export function useChunkedAlbumRendering<T>(items: T[], currentPage: number) {
  const [visibleCount, setVisibleCount] = useState(RENDER_CHUNK_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const renderedItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  useEffect(() => {
    setVisibleCount(RENDER_CHUNK_SIZE);
  }, [items.length, currentPage]);

  useEffect(() => {
    if (!loadMoreRef.current || visibleCount >= items.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }

        setVisibleCount((prev) => Math.min(prev + RENDER_CHUNK_SIZE, items.length));
      },
      {
        root: null,
        rootMargin: '240px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      observer.disconnect();
    };
  }, [items.length, visibleCount]);

  return {
    loadMoreRef,
    renderedItems,
    hasMoreItems: renderedItems.length < items.length,
  };
}
