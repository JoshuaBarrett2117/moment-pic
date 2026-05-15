import React, { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './Sidebar';
import { GalleryPagination } from './GalleryPagination';
import { GalleryAlbumGrid } from './gallery/GalleryAlbumGrid';
import { GalleryDirectoryBreadcrumbs } from './gallery/GalleryDirectoryBreadcrumbs';
import { GalleryFilters } from './gallery/GalleryFilters';
import { GalleryHeader } from './gallery/GalleryHeader';
import {
  getGallerySortOptions,
  hasGalleryActiveFilters,
  resolveGalleryEmptyText,
  resolveGalleryHeaderText,
  type GalleryDisplayMode,
  type GallerySourceType,
} from './gallery/gallery-screen-state';
import { useChunkedAlbumRendering } from './gallery/useChunkedAlbumRendering';
import { useGalleryScrollRestoration } from './gallery/useGalleryScrollRestoration';
import { useMobile, useSystemConfig, useWideMobile } from '../hooks';
import type { AlbumListItemDTO, PaginationDTO, LibraryRootDTO, SmartAlbumListItemDTO, DirectoryAlbumNodeDTO, DirectoryAlbumBreadcrumbDTO } from '../types/api';

interface GalleryScreenProps {
  displayMode?: GalleryDisplayMode;
  albums: Array<AlbumListItemDTO | SmartAlbumListItemDTO | DirectoryAlbumNodeDTO>;
  isLoading: boolean;
  pagination: PaginationDTO | null;
  onNavigateToAlbum: (albumId: string) => void;
  onProfileClick: () => void;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
  onSortByChange: (sortBy: 'name' | 'updatedAt' | 'assetCount' | 'albumCount') => void;
  onSortOrderChange: (sortOrder: 'asc' | 'desc') => void;
  onPageSizeChange: (pageSize: number) => void;
  onSourceTypeChange?: (sourceType: 'folder' | 'zip' | '') => void;
  currentSortBy: 'name' | 'updatedAt' | 'assetCount' | 'albumCount';
  currentSortOrder: 'asc' | 'desc';
  currentPageSize: number;
  currentSourceType?: 'folder' | 'zip' | '';
  currentKeyword: string;
  activeTab: 'gallery' | 'settings';
  onSidebarNavigate: (tab: 'gallery' | 'settings') => void;
  libraryRoots: LibraryRootDTO[];
  currentLibraryRootId: string;
  onLibraryRootChange: (id: string) => void;
  onKeywordChange: (keyword: string) => void;
  onScanAll: () => void;
  onScanOne: (libraryRootId: string) => void;
  isAnyScanning: boolean;
  isScanning: (libraryRootId: string) => boolean;
  onAlbumDeleted?: () => void;
  onRecentClick: () => void;
  isRecentActive: boolean;
  scrollPosition?: number;
  onScrollPositionChange?: (position: number) => void;
  onSmartAlbumsClick: () => void;
  isSmartAlbumsActive: boolean;
  onDirectoryAlbumsClick: () => void;
  isDirectoryAlbumsActive: boolean;
  onDirectoryNodeClick?: (node: DirectoryAlbumNodeDTO) => void;
  directoryBreadcrumbs?: DirectoryAlbumBreadcrumbDTO[];
  onDirectoryBreadcrumbClick?: (crumb: DirectoryAlbumBreadcrumbDTO) => void;
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

export const GalleryScreen: React.FC<GalleryScreenProps> = ({
  displayMode,
  albums,
  isLoading,
  pagination,
  onNavigateToAlbum,
  onProfileClick,
  onRefresh,
  onPageChange,
  onSortByChange,
  onSortOrderChange,
  onPageSizeChange,
  onSourceTypeChange,
  currentSortBy,
  currentSortOrder,
  currentPageSize,
  currentSourceType,
  currentKeyword,
  activeTab,
  onSidebarNavigate,
  libraryRoots,
  currentLibraryRootId,
  onLibraryRootChange,
  onKeywordChange,
  onScanAll,
  onScanOne,
  isAnyScanning,
  isScanning,
  onRecentClick,
  isRecentActive,
  scrollPosition,
  onScrollPositionChange,
  onSmartAlbumsClick,
  isSmartAlbumsActive,
  onDirectoryAlbumsClick,
  isDirectoryAlbumsActive,
  onDirectoryNodeClick,
  directoryBreadcrumbs = [],
  onDirectoryBreadcrumbClick,
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
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const isSmartAlbumsMode = resolvedDisplayMode === 'smartAlbums';
  const isDirectoryAlbumsMode = resolvedDisplayMode === 'directoryAlbums';
  const currentPage = pagination?.page || 1;
  const { loadMoreRef, renderedItems: renderedAlbums, hasMoreItems } = useChunkedAlbumRendering(albums, currentPage);
  const { mainRef, rememberScrollPosition } = useGalleryScrollRestoration({
    scrollPosition,
    onScrollPositionChange,
  });

  const hasActiveFilters = hasGalleryActiveFilters({
    currentKeyword,
    currentSortBy,
    currentSortOrder,
    currentPageSize,
    currentSourceType: resolvedSourceType,
    currentLibraryRootId,
    displayMode: resolvedDisplayMode,
  });
  const albumListItemMinWidth = isMobile
    ? (isWideMobile
      ? (systemConfig?.albumListItemMinWidthDesktop ?? DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_DESKTOP)
      : (systemConfig?.albumListItemMinWidthMobile ?? DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_MOBILE))
    : (systemConfig?.albumListItemMinWidthDesktop ?? DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_DESKTOP);
  const mainPaddingClass = isMobile ? (isWideMobile ? 'px-6 pt-14 pb-[calc(env(safe-area-inset-bottom)+7rem)]' : 'px-4 pt-12 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]') : 'md:ml-80 md:px-12 md:pt-16 md:pb-24';
  const headerClass = isMobile
    ? `relative z-10 mb-4 flex w-auto items-center justify-between bg-surface/92 py-3 ${isWideMobile ? '-mx-6 px-6' : '-mx-4 px-4'}`
    : 'relative z-10 -mx-4 mb-4 flex w-auto items-center justify-between bg-surface/92 px-4 py-3 md:mx-0 md:mb-8 md:bg-transparent md:px-0 md:py-0';
  const gridGapClass = isWideMobile ? 'gap-5' : 'gap-4 md:gap-6';
  const sortOptions = getGallerySortOptions(resolvedDisplayMode);
  const headerText = resolveGalleryHeaderText({ displayMode: resolvedDisplayMode, headerTitle, headerDescription });
  const emptyText = resolveGalleryEmptyText({ displayMode: resolvedDisplayMode, hasActiveFilters, emptyTitle, emptyDescription });
  useEffect(() => {
    if (isMobile) {
      setIsFilterExpanded(false);
    }
  }, [isMobile]);

  useEffect(() => {
    void fetchSystemConfig();
  }, [fetchSystemConfig]);

  const handleNavigateToAlbum = (albumId: string) => {
    rememberScrollPosition();
    onNavigateToAlbum(albumId);
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onNavigate={onSidebarNavigate}
        libraryRoots={libraryRoots}
        currentLibraryRootId={isSmartAlbumsMode ? '' : currentLibraryRootId}
        onLibraryRootChange={onLibraryRootChange}
        onScanAll={onScanAll}
        onScanOne={onScanOne}
        isAnyScanning={isAnyScanning}
        isScanning={isScanning}
        albumCount={pagination?.total || 0}
        onRecentClick={onRecentClick}
        isRecentActive={isRecentActive}
        onSmartAlbumsClick={onSmartAlbumsClick}
        isSmartAlbumsActive={isSmartAlbumsActive}
        onDirectoryAlbumsClick={onDirectoryAlbumsClick}
        isDirectoryAlbumsActive={isDirectoryAlbumsActive}
      />

      <main
        ref={mainRef}
        className={`relative h-full flex-1 overflow-y-auto bg-surface custom-scrollbar ${mainPaddingClass}`}
      >
        <GalleryHeader
          title={headerText.title}
          description={headerText.description}
          isMobile={isMobile}
          isWideMobile={isWideMobile}
          headerClass={headerClass}
          onBack={onBack}
          onProfileClick={onProfileClick}
        />

        {isDirectoryAlbumsMode && directoryBreadcrumbs.length > 0 && (
          <GalleryDirectoryBreadcrumbs
            breadcrumbs={directoryBreadcrumbs}
            onBreadcrumbClick={onDirectoryBreadcrumbClick}
          />
        )}

        {!isDirectoryAlbumsMode && (
          <GalleryFilters
            isSmartAlbumsMode={isSmartAlbumsMode}
            isWideMobile={isWideMobile}
            isFilterExpanded={isFilterExpanded}
            sortOptions={sortOptions}
            currentKeyword={currentKeyword}
            currentSortBy={currentSortBy}
            currentSortOrder={currentSortOrder}
            currentPageSize={currentPageSize}
            currentSourceType={resolvedSourceType}
            onToggleExpanded={() => setIsFilterExpanded(!isFilterExpanded)}
            onKeywordChange={onKeywordChange}
            onSourceTypeChange={onSourceTypeChange}
            onSortByChange={onSortByChange}
            onSortOrderChange={onSortOrderChange}
            onPageSizeChange={onPageSizeChange}
            onRefresh={onRefresh}
          />
        )}

        {isLoading && albums.length > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-outline/10 bg-surface-container-high px-4 py-3 text-sm text-outline shadow-sm md:mb-6">
            <span>正在更新筛选结果...</span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
              请稍候
            </span>
          </div>
        )}

        <GalleryAlbumGrid
          albums={albums}
          renderedAlbums={renderedAlbums}
          isLoading={isLoading}
          isMobile={isMobile}
          isSmartAlbumsMode={isSmartAlbumsMode}
          gridGapClass={gridGapClass}
          albumListItemMinWidth={albumListItemMinWidth}
          emptyTitle={emptyText.title}
          emptyDescription={emptyText.description}
          onNavigateToAlbum={handleNavigateToAlbum}
          onDirectoryNodeClick={onDirectoryNodeClick}
        />

        {hasMoreItems && (
          <div ref={loadMoreRef} className="w-full py-6 text-center text-sm text-outline/70">
            正在加载更多相册...
          </div>
        )}

        <GalleryPagination pagination={pagination} isLoading={isLoading} onPageChange={onPageChange} />
      </main>
    </div>
  );
};
