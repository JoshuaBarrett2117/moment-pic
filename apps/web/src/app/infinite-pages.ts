import { useMemo, useRef } from 'react';
import type { PaginationDTO } from '../types/api';

export type PageResult<T> = { items: T[]; pagination: PaginationDTO };
export type AccumulatedPages<T> = { key: string; loadedPage: number; items: T[]; pagination: PaginationDTO };

/**
 * 无限滚动：把同一查询（key 相同）的连续分页结果合并成一个列表。
 * - key 变化或回到第 1 页：重新开始；
 * - 同一页或之前已加载的页再次返回（刷新、扫描轮询、收藏切换）：按 id 原位更新，不丢已加载内容；
 * - 下一页：按 id 去重后追加。
 */
export const accumulatePages = <T extends { id: string }>(
  previous: AccumulatedPages<T> | null,
  key: string,
  result: PageResult<T>,
): AccumulatedPages<T> => {
  const page = result.pagination.page;
  if (!previous || previous.key !== key || (page <= 1 && previous.loadedPage <= 1)) {
    return { key, loadedPage: page, items: result.items, pagination: result.pagination };
  }

  const incoming = new Map(result.items.map((item) => [item.id, item]));
  const merged = previous.items.map((item) => {
    const updated = incoming.get(item.id);
    if (updated) incoming.delete(item.id);
    return updated ?? item;
  });

  if (page > previous.loadedPage + 1) {
    // 跳页（例如从网址直接打开第 N 页）：无法拼接，重新开始
    return { key, loadedPage: page, items: result.items, pagination: result.pagination };
  }

  return {
    key,
    loadedPage: Math.max(previous.loadedPage, page),
    items: page === previous.loadedPage + 1 ? [...merged, ...incoming.values()] : merged,
    pagination: { ...result.pagination, page: Math.max(previous.loadedPage, page) },
  };
};

export const hasMorePages = (pagination: PaginationDTO | null | undefined): boolean =>
  Boolean(pagination && pagination.page * pagination.pageSize < pagination.total);

/** 把分页接口结果累积成无限滚动列表；结果引用不变时返回同一个对象。 */
export const useAccumulatedPages = <T extends { id: string }>(result: PageResult<T> | null, key: string): PageResult<T> | null => {
  const stateRef = useRef<AccumulatedPages<T> | null>(null);
  const lastResultRef = useRef<PageResult<T> | null>(null);
  return useMemo(() => {
    if (!result) return null;
    // 没有分页信息（旧接口或测试桩）时不累积，原样返回
    if (!result.pagination) return result;
    if (lastResultRef.current !== result || stateRef.current?.key !== key) {
      stateRef.current = accumulatePages(stateRef.current, key, result);
      lastResultRef.current = result;
    }
    return { items: stateRef.current.items, pagination: stateRef.current.pagination };
  }, [key, result]);
};
