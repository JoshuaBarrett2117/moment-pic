import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { isRequestCancellation } from '../hooks/useLatestRequest';
import type { AlbumListItemDTO, PaginationDTO } from '../types/api';
import type { GalleryFilters, GalleryViewMode } from './gallery-navigation';
import { hasMorePages } from './infinite-pages';

/** 向服务端询问“下一个图集”时使用的排序与筛选（与 GET /albums 同义）。 */
export type NextAlbumQuery = {
  sortBy: 'name' | 'updatedAt' | 'assetCount';
  sortOrder: 'asc' | 'desc';
  keyword?: string;
  sourceType?: 'folder' | 'zip';
  libraryRootId?: string;
  favoriteOnly?: boolean;
};

/**
 * 进入图集时的列表上下文：
 * - albums：当前列表（展示顺序）；
 * - hasMore：列表后面还有服务端没加载的页（无限滚动只加载了一部分）；
 * - serverQuery：本地判断不了时向服务端询问的顺序。
 */
export type NextAlbumContext = {
  albums: readonly { id: string }[];
  hasMore: boolean;
  serverQuery: NextAlbumQuery;
};

export type LocalNextAlbum =
  | { status: 'found'; albumId: string }
  | { status: 'end' }
  | { status: 'unknown' };

export type NextAlbumState = {
  nextAlbumId: string | null;
  /** ready：有下一个；loading：还在向服务端确认；none：确实是最后一个 */
  status: 'ready' | 'loading' | 'none';
};

/** 上下文丢失（刷新/直达网址/从首页进入）时的兜底顺序：主图集列表默认排序。 */
export const MAIN_ALBUM_ORDER: NextAlbumQuery = { sortBy: 'updatedAt', sortOrder: 'desc' };

/**
 * 只用已加载的列表判断下一个图集：
 * - 当前图集在列表里且后面还有 → found；
 * - 是列表最后一个且列表完整 → end（真正的最后一个）；
 * - 是已加载部分的最后一个但后面还有页、或当前图集根本不在列表里（上下文丢失）→ unknown，需要问服务端。
 */
export const resolveNextAlbumLocally = (
  albums: readonly { id: string }[] | null | undefined,
  currentAlbumId: string,
  hasMore: boolean,
): LocalNextAlbum => {
  const list = albums || [];
  const index = list.findIndex((album) => album.id === currentAlbumId);
  if (index < 0) return { status: 'unknown' };
  const next = list[index + 1];
  if (next) return { status: 'found', albumId: next.id };
  return hasMore ? { status: 'unknown' } : { status: 'end' };
};

const toListSortBy = (sortBy: GalleryFilters['sortBy']): NextAlbumQuery['sortBy'] =>
  sortBy === 'albumCount' ? 'updatedAt' : sortBy;

/** 根据进入图集时所在的视图，给出“下一个图集”的判定上下文。 */
export const buildNextAlbumContext = (input: {
  galleryViewMode: GalleryViewMode;
  isRecentActive: boolean;
  selectedSmartAlbum: string | null;
  smartAlbumMemberAlbums: readonly AlbumListItemDTO[];
  directoryNavigationAlbums: readonly AlbumListItemDTO[];
  recentAlbums: readonly AlbumListItemDTO[] | null | undefined;
  albums: { items: AlbumListItemDTO[]; pagination: PaginationDTO } | null | undefined;
  filters: Pick<GalleryFilters, 'sortBy' | 'sortOrder' | 'sourceType' | 'libraryRootId'>;
  debouncedKeyword: string;
}): NextAlbumContext => {
  const { galleryViewMode } = input;
  // 智能相册成员、目录、最近浏览都是一次性取全的列表：当前图集在里面时按它们的顺序走；
  // 不在（刷新后列表没加载）时退回主图集列表顺序。
  if (galleryViewMode === 'smartAlbums') {
    return {
      albums: input.selectedSmartAlbum ? input.smartAlbumMemberAlbums : [],
      hasMore: false,
      serverQuery: MAIN_ALBUM_ORDER,
    };
  }
  if (galleryViewMode === 'directoryAlbums') {
    return { albums: input.directoryNavigationAlbums, hasMore: false, serverQuery: MAIN_ALBUM_ORDER };
  }
  if (galleryViewMode === 'home') {
    // 首页的卡片（继续阅读/最近/收藏）不是 albums 状态里的列表；那里可能残留着别的视图的旧列表，不能拿来判断。
    return { albums: [], hasMore: false, serverQuery: MAIN_ALBUM_ORDER };
  }
  if (input.isRecentActive) {
    return { albums: input.recentAlbums || [], hasMore: false, serverQuery: MAIN_ALBUM_ORDER };
  }

  const keyword = input.debouncedKeyword.trim();
  return {
    albums: input.albums?.items || [],
    hasMore: hasMorePages(input.albums?.pagination),
    serverQuery: {
      sortBy: toListSortBy(input.filters.sortBy),
      sortOrder: input.filters.sortOrder,
      ...(keyword ? { keyword } : {}),
      ...(input.filters.sourceType ? { sourceType: input.filters.sourceType } : {}),
      ...(input.filters.libraryRootId ? { libraryRootId: input.filters.libraryRootId } : {}),
      ...(galleryViewMode === 'favorites' ? { favoriteOnly: true } : {}),
    },
  };
};

export const toNextAlbumParams = (query: NextAlbumQuery): Record<string, string> => {
  const params: Record<string, string> = { sortBy: query.sortBy, sortOrder: query.sortOrder };
  if (query.keyword) params.keyword = query.keyword;
  if (query.sourceType) params.sourceType = query.sourceType;
  if (query.libraryRootId) params.libraryRootId = query.libraryRootId;
  if (query.favoriteOnly) params.favoriteOnly = 'true';
  return params;
};

/**
 * 当前图集看完后“进入下一个图集”的目标。
 * 优先用已加载列表；判断不了（无限滚动未加载到下一页、刷新/直达后列表上下文丢失）时立即向服务端
 * GET /albums/:id/next 询问，结果到达前 status 为 loading，只有确认是最后一个时才是 none。
 */
export const useNextAlbum = ({ albumId, context, enabled }: {
  albumId: string | null;
  context: NextAlbumContext;
  enabled: boolean;
}): NextAlbumState => {
  const local = useMemo<LocalNextAlbum>(
    () => (albumId ? resolveNextAlbumLocally(context.albums, albumId, context.hasMore) : { status: 'end' }),
    [albumId, context.albums, context.hasMore],
  );
  const serverQueryKey = JSON.stringify(context.serverQuery);
  const remoteKey = enabled && albumId && local.status === 'unknown' ? `${albumId}|${serverQueryKey}` : null;
  const [remote, setRemote] = useState<{ key: string; nextAlbumId: string | null } | null>(null);

  useEffect(() => {
    if (!remoteKey || !albumId) return;
    const controller = new AbortController();
    const query = JSON.parse(serverQueryKey) as NextAlbumQuery;
    api.get<{ album: AlbumListItemDTO | null }>(
      `/albums/${encodeURIComponent(albumId)}/next`,
      toNextAlbumParams(query),
      { signal: controller.signal },
    ).then((result) => {
      if (!controller.signal.aborted) setRemote({ key: remoteKey, nextAlbumId: result?.album?.id ?? null });
    }, (error: unknown) => {
      if (controller.signal.aborted || isRequestCancellation(error)) return;
      // 查询失败：不冒充“有下一个”，按没有处理
      setRemote({ key: remoteKey, nextAlbumId: null });
    });
    return () => controller.abort();
  }, [albumId, remoteKey, serverQueryKey]);

  if (!enabled || !albumId) return { nextAlbumId: null, status: 'none' };
  if (local.status === 'found') return { nextAlbumId: local.albumId, status: 'ready' };
  if (local.status === 'end') return { nextAlbumId: null, status: 'none' };
  if (remote && remote.key === remoteKey) {
    return remote.nextAlbumId ? { nextAlbumId: remote.nextAlbumId, status: 'ready' } : { nextAlbumId: null, status: 'none' };
  }
  return { nextAlbumId: null, status: 'loading' };
};
