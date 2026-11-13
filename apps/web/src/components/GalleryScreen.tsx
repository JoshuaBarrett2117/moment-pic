import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { AlbumShareDialog } from './AlbumShareDialog';
import { HomeView } from './HomeView';
import { GalleryAlbumGrid } from './gallery/GalleryAlbumGrid';
import { GalleryDirectoryBreadcrumbs } from './gallery/GalleryDirectoryBreadcrumbs';
import { GalleryHeader } from './gallery/GalleryHeader';
import { GalleryToolbar } from './gallery/GalleryToolbar';
import { scaleCardWidth, useCardSize } from './gallery/card-size';
import {
  getGallerySortOptions,
  hasGalleryActiveFilters,
  resolveGalleryEmptyText,
  resolveGalleryEyebrow,
  resolveGalleryHeaderText,
  type GalleryDisplayMode,
  type GallerySourceType,
} from './gallery/gallery-screen-state';
import { useGalleryScrollRestoration } from './gallery/useGalleryScrollRestoration';
import { hasMorePages } from '../app/infinite-pages';
import { useMobile, useSystemConfig, useWideMobile } from '../hooks';
import type { AlbumListItemDTO, PaginationDTO, SmartAlbumListItemDTO, DirectoryAlbumNodeDTO, DirectoryAlbumBreadcrumbDTO } from '../types/api';

type SortBy = 'name' | 'updatedAt' | 'assetCount' | 'albumCount';

interface GalleryScreenProps {
  displayMode?: GalleryDisplayMode;
  albums: Array<AlbumListItemDTO | SmartAlbumListItemDTO | DirectoryAlbumNodeDTO>;
  isLoading: boolean;
  pagination: PaginationDTO | null;
  onNavigateToAlbum: (albumId: string) => void;
  /** 首页里点开智能相册 */
  onNavigateToSmartAlbum?: (smartAlbumId: string) => void;
  onLoadMore?: (nextPage: number) => void;
  onSortByChange: (sortBy: SortBy) => void;
  onSortOrderChange: (sortOrder: 'asc' | 'desc') => void;
  onSourceTypeChange?: (sourceType: 'folder' | 'zip' | '') => void;
  onKeywordChange: (keyword: string) => void;
  onResetFilters?: () => void;
  currentSortBy: SortBy;
  currentSortOrder: 'asc' | 'desc';
  currentSourceType?: 'folder' | 'zip' | '';
  currentKeyword: string;
  currentLibraryRootId: string;
  isRecentActive: boolean;
  scrollPosition?: number;
  onScrollPositionChange?: (position: number) => void;
  onDirectoryNodeClick?: (node: DirectoryAlbumNodeDTO) => void;
  directoryBreadcrumbs?: DirectoryAlbumBreadcrumbDTO[];
  onDirectoryBreadcrumbClick?: (crumb: DirectoryAlbumBreadcrumbDTO) => void;
  onAlbumFavoriteToggle?: (album: AlbumListItemDTO) => Promise<void> | void;
  headerEyebrow?: string;
  headerTitle?: string;
  headerDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onBack?: () => void;
}

const DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_MOBILE = 160;
const DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_DESKTOP = 300;
const DEFAULT_GALLERY_DISPLAY_MODE: GalleryDisplayMode = 'albums';
const DEFAULT_GALLERY_SOURCE_TYPE: GallerySourceType = '';

/** 图库主框架：全局导航 + 首页或相册列表（吸顶工具栏、封面卡片、无限滚动）。 */
export const GalleryScreen: React.FC<GalleryScreenProps> = ({
  displayMode,
  albums,
  isLoading,
  pagination,
  onNavigateToAlbum,
  onNavigateToSmartAlbum,
  onLoadMore,
  onSortByChange,
  onSortOrderChange,
  onSourceTypeChange,
  onKeywordChange,
  onResetFilters,
  currentSortBy,
  currentSortOrder,
  currentSourceType,
  currentKeyword,
  currentLibraryRootId,
  isRecentActive,
  scrollPosition,
  onScrollPositionChange,
  onDirectoryNodeClick,
  directoryBreadcrumbs = [],
  onDirectoryBreadcrumbClick,
  onAlbumFavoriteToggle,
  headerEyebrow,
  headerTitle,
  headerDescription,
  emptyTitle,
  emptyDescription,
  onBack,
}) => {
  const resolvedDisplayMode = displayMode ?? DEFAULT_GALLERY_DISPLAY_MODE;
  const resolvedSourceType = currentSourceType ?? DEFAULT_GALLERY_SOURCE_TYPE;
  const isMobile = useMobile();
  const isWideMobile = useWideMobile();
  const { systemConfig, fetchSystemConfig } = useSystemConfig();
  const { size: cardSize, setSize: setCardSize } = useCardSize();
  const [sharingAlbum, setSharingAlbum] = useState<AlbumListItemDTO | null>(null);
  const isHome = resolvedDisplayMode === 'home';
  const isSmartAlbumsMode = resolvedDisplayMode === 'smartAlbums';
  const isDirectoryAlbumsMode = resolvedDisplayMode === 'directoryAlbums';
  const { mainRef, rememberScrollPosition } = useGalleryScrollRestoration({ scrollPosition, onScrollPositionChange });
  const pageSentinelRef = useRef<HTMLDivElement | null>(null);
  const canLoadMorePages = Boolean(onLoadMore) && hasMorePages(pagination);

  const hasActiveFilters = hasGalleryActiveFilters({
    isRecentActive,
    currentKeyword,
    currentSortBy,
    currentSortOrder,
    currentSourceType: resolvedSourceType,
    currentLibraryRootId,
    displayMode: resolvedDisplayMode,
  });
  const baseMinWidth = isMobile && !isWideMobile
    ? (systemConfig?.albumListItemMinWidthMobile ?? DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_MOBILE)
    // 系统设置里的最小宽度是为旧的方形卡片定的；封面卡片是 4:5 竖图，按 0.66 折算
    : Math.round((systemConfig?.albumListItemMinWidthDesktop ?? DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_DESKTOP) * 0.66);
  const albumListItemMinWidth = scaleCardWidth(baseMinWidth, cardSize, isMobile ? 104 : 140);
  const sortOptions = getGallerySortOptions(resolvedDisplayMode);
  const headerText = resolveGalleryHeaderText({
    displayMode: resolvedDisplayMode,
    headerTitle: headerTitle ?? (isRecentActive ? '最近浏览' : undefined),
    headerDescription: headerDescription ?? (isRecentActive ? '最近打开过的图集' : undefined),
  });
  const emptyText = resolveGalleryEmptyText({ displayMode: resolvedDisplayMode, isRecentActive, hasActiveFilters, emptyTitle, emptyDescription });

  useEffect(() => {
    void fetchSystemConfig();
  }, [fetchSystemConfig]);

  // 无限滚动：哨兵进入视口（提前 600px）时请求下一页
  useEffect(() => {
    const node = pageSentinelRef.current;
    if (!node || !canLoadMorePages || isLoading || !pagination) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onLoadMore?.(pagination.page + 1);
    }, { root: mainRef.current, rootMargin: '600px 0px', threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMorePages, isLoading, mainRef, onLoadMore, pagination]);

  const handleNavigateToAlbum = (albumId: string) => {
    rememberScrollPosition();
    onNavigateToAlbum(albumId);
  };

  const showToolbar = !isHome && !isDirectoryAlbumsMode && !isRecentActive && !onBack;
  const loadedAll = !isHome && Boolean(pagination) && !hasMorePages(pagination) && albums.length > 12;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <Sidebar />

      <main
        ref={mainRef}
        className="mp-with-sidebar custom-scrollbar relative h-full flex-1 overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] md:px-10 md:pt-9 xl:px-12"
      >
        {isHome ? (
          <HomeView
            isMobile={isMobile}
            onOpenAlbum={handleNavigateToAlbum}
            onOpenSmartAlbum={(id) => {
              rememberScrollPosition();
              onNavigateToSmartAlbum?.(id);
            }}
            onAlbumFavoriteToggle={onAlbumFavoriteToggle}
            onShareAlbum={setSharingAlbum}
          />
        ) : (
          <>
            <GalleryHeader
              eyebrow={headerEyebrow ?? resolveGalleryEyebrow(resolvedDisplayMode, isRecentActive)}
              title={headerText.title}
              description={headerText.description}
              onBack={onBack}
            />

            {isDirectoryAlbumsMode && directoryBreadcrumbs.length > 0 && (
              <GalleryDirectoryBreadcrumbs breadcrumbs={directoryBreadcrumbs} onBreadcrumbClick={onDirectoryBreadcrumbClick} />
            )}

            {showToolbar && (
              <GalleryToolbar
                isSmartAlbumsMode={isSmartAlbumsMode}
                isCompact={isMobile && !isWideMobile}
                sortOptions={sortOptions}
                currentKeyword={currentKeyword}
                currentSortBy={currentSortBy}
                currentSortOrder={currentSortOrder}
                currentSourceType={resolvedSourceType}
                total={pagination?.total ?? null}
                hasActiveFilters={hasActiveFilters}
                cardSize={cardSize}
                onCardSizeChange={setCardSize}
                onKeywordChange={onKeywordChange}
                onSourceTypeChange={onSourceTypeChange}
                onSortByChange={onSortByChange}
                onSortOrderChange={onSortOrderChange}
                onReset={() => onResetFilters?.()}
              />
            )}

            <GalleryAlbumGrid
              albums={albums}
              isLoading={isLoading}
              isMobile={isMobile}
              isSmartAlbumsMode={isSmartAlbumsMode}
              gridGapClass={isMobile ? 'gap-3' : 'gap-4'}
              gridGap={isMobile ? 12 : 16}
              scrollElementRef={mainRef}
              albumListItemMinWidth={albumListItemMinWidth}
              emptyTitle={emptyText.title}
              emptyDescription={emptyText.description}
              onNavigateToAlbum={handleNavigateToAlbum}
              onDirectoryNodeClick={onDirectoryNodeClick}
              onAlbumFavoriteToggle={onAlbumFavoriteToggle}
              onAlbumShare={setSharingAlbum}
            />

            {canLoadMorePages && (
              <div ref={pageSentinelRef} className="flex items-center justify-center gap-2 py-8 text-sm text-on-surface-variant">
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {isLoading ? '正在加载更多…' : ''}
              </div>
            )}
            {loadedAll && (
              <div className="flex items-center justify-center gap-3 py-10 text-xs tracking-[0.2em] text-outline">
                <span className="h-px w-10 bg-outline-variant" />
                已经到底了 · 共 {pagination?.total} 个
                <span className="h-px w-10 bg-outline-variant" />
              </div>
            )}
          </>
        )}
      </main>

      {sharingAlbum && (
        <AlbumShareDialog albumId={sharingAlbum.id} albumName={sharingAlbum.name} onClose={() => setSharingAlbum(null)} />
      )}
    </div>
  );
};
