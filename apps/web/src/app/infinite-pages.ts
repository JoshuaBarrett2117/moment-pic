import { useMemo, useRef } from 'react';
import type { PaginationDTO } from '../types/api';

export type PageResult<T> = { items: T[]; pagination: PaginationDTO };
/** 累积结果；pageCursors[n] 为请求第 n 页所需的游标（由第 n-1 页的 nextCursor 得来）。 */
export type AccumulatedResult<T> = PageResult<T> & { pageCursors: Record<number, string> };
export type AccumulatedPages<T> = {
  key: string;
  loadedPage: number;
  items: T[];
  pagination: PaginationDTO;
  pageCursors: Record<number, string>;
};

const withCursor = (cursors: Record<number, string>, page: number, pagination: PaginationDTO): Record<number, string> =>
  pagination.nextCursor ? { ...cursors, [page + 1]: pagination.nextCursor } : cursors;

/**
 * 无限滚动：把同一查询（key 相同）的连续分页结果合并成一个列表。
 * - key 变化或回到第 1 页：重新开始；
 * - 同一页或之前已加载的页再次返回（刷新、扫描轮询、收藏切换）：按 id 原位更新，不丢已加载内容；
 * - 下一页：按 id 去重后追加。
 * 合并后的 pagination.nextCursor 始终是“最后已加载页”的下一页游标。
 */
export const accumulatePages = <T extends { id: string }>(
  previous: AccumulatedPages<T> | null,
  key: string,
  result: PageResult<T>,
): AccumulatedPages<T> => {
  const page = result.pagination.page;
  if (!previous || previous.key !== key || (page <= 1 && previous.loadedPage <= 1)) {
    return { key, loadedPage: page, items: result.items, pagination: result.pagination, pageCursors: withCursor({}, page, result.pagination) };
  }

  const incoming = new Map(result.items.map((item) => [item.id, item]));
  const merged = previous.items.map((item) => {
    const updated = incoming.get(item.id);
    if (updated) incoming.delete(item.id);
    return updated ?? item;
  });

  if (page > previous.loadedPage + 1) {
    // 跳页（例如从网址直接打开第 N 页）：无法拼接，重新开始
    return { key, loadedPage: page, items: result.items, pagination: result.pagination, pageCursors: withCursor({}, page, result.pagination) };
  }

  const isNewLastPage = page >= previous.loadedPage;
  const loadedPage = Math.max(previous.loadedPage, page);
  return {
    key,
    loadedPage,
    items: page === previous.loadedPage + 1 ? [...merged, ...incoming.values()] : merged,
    pagination: isNewLastPage
      ? { ...result.pagination, page: loadedPage }
      // 刷新较早的页：总数取最新，但“是否还有更多/下一页游标”仍以最后已加载页为准
      : { ...result.pagination, page: loadedPage, ...('nextCursor' in previous.pagination ? { nextCursor: previous.pagination.nextCursor } : {}) },
    pageCursors: isNewLastPage ? withCursor(previous.pageCursors, page, result.pagination) : previous.pageCursors,
  };
};

/** 有 nextCursor 字段时以它为准（游标分页）；否则按页码与总数推算（旧接口/智能相册）。 */
export const hasMorePages = (pagination: PaginationDTO | null | undefined): boolean => {
  if (!pagination) return false;
  if (pagination.nextCursor !== undefined) return Boolean(pagination.nextCursor);
  return pagination.page * pagination.pageSize < pagination.total;
};

/** 把分页接口结果累积成无限滚动列表；结果引用不变时返回同一个对象。 */
export const useAccumulatedPages = <T extends { id: string }>(result: PageResult<T> | null, key: string): AccumulatedResult<T> | null => {
  const stateRef = useRef<AccumulatedPages<T> | null>(null);
  const lastResultRef = useRef<PageResult<T> | null>(null);
  const staleResultRef = useRef<PageResult<T> | null>(null);
  return useMemo(() => {
    if (!result) return null;
    // 没有分页信息（旧接口或测试桩）时不累积，原样返回
    if (!result.pagination) return { ...result, pageCursors: {} };
    // 查询已变、新结果未到：旧结果原样展示，但不并入新查询（其页码与游标属于旧查询）
    if (stateRef.current && stateRef.current.key !== key && lastResultRef.current === result) {
      stateRef.current = null;
      staleResultRef.current = result;
    }
    if (staleResultRef.current === result) return { items: result.items, pagination: result.pagination, pageCursors: {} };
    staleResultRef.current = null;
    if (lastResultRef.current !== result || stateRef.current?.key !== key) {
      stateRef.current = accumulatePages(stateRef.current, key, result);
      lastResultRef.current = result;
    }
    return { items: stateRef.current.items, pagination: stateRef.current.pagination, pageCursors: stateRef.current.pageCursors };
  }, [key, result]);
};
