import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Layers3, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ThrottledImage } from './ThrottledImage';
import { useMobile, useSystemConfig, useWideMobile } from '../hooks';
import type { LibraryRootDTO, PaginationDTO, SmartAlbumListItemDTO } from '../types/api';

interface SmartAlbumGalleryScreenProps {
  smartAlbums: SmartAlbumListItemDTO[];
  isLoading: boolean;
  pagination: PaginationDTO | null;
  libraryRoots: LibraryRootDTO[];
  onLibraryRootChange: (id: string) => void;
  activeTab: 'gallery' | 'settings';
  onSidebarNavigate: (tab: 'gallery' | 'settings') => void;
  onScanAll: () => void;
  onScanOne: (libraryRootId: string) => void;
  isAnyScanning: boolean;
  isScanning: (libraryRootId: string) => boolean;
  onRecentClick: () => void;
  onSmartAlbumsClick: () => void;
  onProfileClick: () => void;
  onNavigateToSmartAlbum: (smartAlbumId: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onKeywordChange: (keyword: string) => void;
  onSortByChange: (sortBy: 'name' | 'updatedAt' | 'albumCount' | 'assetCount') => void;
  onSortOrderChange: (sortOrder: 'asc' | 'desc') => void;
  currentPageSize: number;
  currentKeyword: string;
  currentSortBy: 'name' | 'updatedAt' | 'albumCount' | 'assetCount';
  currentSortOrder: 'asc' | 'desc';
}

const DEFAULT_CARD_WIDTH_MOBILE = 160;
const DEFAULT_CARD_WIDTH_DESKTOP = 300;

export const SmartAlbumGalleryScreen: React.FC<SmartAlbumGalleryScreenProps> = ({
  smartAlbums,
  isLoading,
  pagination,
  libraryRoots,
  onLibraryRootChange,
  activeTab,
  onSidebarNavigate,
  onScanAll,
  onScanOne,
  isAnyScanning,
  isScanning,
  onRecentClick,
  onSmartAlbumsClick,
  onProfileClick,
  onNavigateToSmartAlbum,
  onPageChange,
  onPageSizeChange,
  onKeywordChange,
  onSortByChange,
  onSortOrderChange,
  currentPageSize,
  currentKeyword,
  currentSortBy,
  currentSortOrder
}) => {
  const isMobile = useMobile();
  const isWideMobile = useWideMobile();
  const { systemConfig } = useSystemConfig();
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;
  const cardWidth = isMobile
    ? (isWideMobile
      ? (systemConfig?.albumListItemMinWidthDesktop ?? DEFAULT_CARD_WIDTH_DESKTOP)
      : (systemConfig?.albumListItemMinWidthMobile ?? DEFAULT_CARD_WIDTH_MOBILE))
    : (systemConfig?.albumListItemMinWidthDesktop ?? DEFAULT_CARD_WIDTH_DESKTOP);
  const gridTemplateColumns = isMobile && !isWideMobile
    ? 'minmax(0, 1fr)'
    : `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`;
  const headerClass = isMobile
    ? `relative z-10 mb-4 flex w-auto items-center justify-between bg-surface/92 py-3 ${isWideMobile ? '-mx-6 px-6' : '-mx-4 px-4'}`
    : 'relative z-10 -mx-4 mb-4 flex w-auto items-center justify-between bg-surface/92 px-4 py-3 md:mx-0 md:mb-8 md:bg-transparent md:px-0 md:py-0';
  const mainPaddingClass = isMobile ? (isWideMobile ? 'px-6 pt-14 pb-[calc(env(safe-area-inset-bottom)+7rem)]' : 'px-4 pt-12 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]') : 'md:ml-80 md:px-12 md:pt-16 md:pb-24';

  useEffect(() => {
    if (isMobile) {
      setIsFilterExpanded(false);
    }
  }, [isMobile]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onNavigate={onSidebarNavigate}
        libraryRoots={libraryRoots}
        currentLibraryRootId=""
        onLibraryRootChange={onLibraryRootChange}
        onScanAll={onScanAll}
        onScanOne={onScanOne}
        isAnyScanning={isAnyScanning}
        isScanning={isScanning}
        albumCount={pagination?.total || 0}
        onRecentClick={onRecentClick}
        isRecentActive={false}
        onSmartAlbumsClick={onSmartAlbumsClick}
        isSmartAlbumsActive
      />

      <main className={`relative h-full flex-1 overflow-y-auto bg-surface custom-scrollbar ${mainPaddingClass}`}>
        <header className={headerClass}>
          <div className="flex flex-col gap-1">
            <h1 className={`font-script font-bold leading-tight tracking-tighter text-on-surface ${isWideMobile ? 'text-3xl' : 'text-2xl md:text-6xl'}`}>
              自动整理
            </h1>
            <p className={`font-body text-base text-outline/70 ${isMobile ? 'block text-sm' : 'hidden md:block md:text-xl'}`}>
              让归纳好的系列图集自己浮现出来
            </p>
          </div>
          <button
            onClick={onProfileClick}
            title="退出登录"
            className={`cursor-pointer overflow-hidden rounded-full border-2 border-white shadow-md transition-transform hover:scale-105 ${isWideMobile ? 'h-12 w-12' : 'h-11 w-11 md:h-14 md:w-14 md:border-4 md:shadow-xl'}`}
          >
            <img alt="退出登录" className="h-full w-full object-cover" src="https://picsum.photos/seed/portrait/200/200" />
          </button>
        </header>

        <div className="mb-6">
          <button
            onClick={() => setIsFilterExpanded((prev) => !prev)}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-surface-container-high px-4 py-3 text-sm font-semibold text-on-surface md:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {isFilterExpanded ? '收起筛选' : '展开筛选'}
          </button>
          <div className={`${isFilterExpanded ? 'block' : 'hidden'} md:block`}>
            <div className="rounded-2xl bg-surface-container-highest p-4 shadow-sm">
              <div className="relative mb-3 w-full">
                <input
                  className="w-full rounded-full border-2 border-outline/30 bg-surface-container-high py-2 pl-10 pr-10 text-sm outline-none placeholder:text-outline/50 focus:border-transparent focus:ring-2 focus:ring-primary-container"
                  placeholder="搜索自动整理名称"
                  type="text"
                  value={currentKeyword}
                  onChange={(event) => onKeywordChange(event.target.value)}
                />
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
                {currentKeyword && (
                  <button onClick={() => onKeywordChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'md:grid-cols-[minmax(0,1fr)_auto_auto]'}`}>
                <select
                  value={currentSortBy}
                  onChange={(event) => onSortByChange(event.target.value as 'name' | 'updatedAt' | 'albumCount' | 'assetCount')}
                  className="cursor-pointer rounded-lg bg-surface-container-high px-3 py-2 text-sm outline-none"
                >
                  <option value="updatedAt">更新时间</option>
                  <option value="name">名称</option>
                  <option value="albumCount">图集数</option>
                  <option value="assetCount">图片数</option>
                </select>
                <button
                  onClick={() => onSortOrderChange(currentSortOrder === 'asc' ? 'desc' : 'asc')}
                  className="rounded-lg bg-surface-container-high px-3 py-2 text-sm transition-colors hover:bg-primary-container/20"
                >
                  {currentSortOrder === 'asc' ? '正序' : '倒序'}
                </button>
                <select
                  value={currentPageSize}
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                  className="cursor-pointer rounded-lg bg-surface-container-high px-3 py-2 text-sm outline-none"
                >
                  {[12, 24, 48, 96].map((size) => (
                    <option key={size} value={size}>
                      每页 {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {isLoading && smartAlbums.length === 0 ? (
          <div className="grid gap-4 md:gap-6" style={{ gridTemplateColumns }}>
            {Array.from({ length: isMobile ? 8 : 12 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-xl bg-surface-container-highest p-4 shadow-md">
                <div className="mb-4 aspect-square rounded-lg bg-outline/10" />
                <div className="h-6 w-2/3 rounded bg-outline/10" />
              </div>
            ))}
          </div>
        ) : smartAlbums.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <Sparkles className="h-16 w-16 text-outline/20" />
            <div>
              <p className="text-2xl font-bold text-on-surface">还没有生成自动整理</p>
              <p className="mt-2 text-sm text-outline">先到设置里的“智能归纳”新增规则，再重建一次自动整理。</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:gap-6" style={{ gridTemplateColumns }}>
            {smartAlbums.map((album) => (
              <button
                key={album.id}
                onClick={() => onNavigateToSmartAlbum(album.id)}
                className="group rounded-xl bg-surface-container-highest p-4 text-left shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="relative mb-4 overflow-hidden rounded-xl">
                  {album.coverUrl ? (
                    <ThrottledImage className="aspect-square w-full object-cover" src={album.coverUrl} alt={album.name} />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-surface-container-high">
                      <Layers3 className="h-12 w-12 text-outline/20" />
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded-full bg-primary-container/90 px-3 py-1 text-xs font-bold text-on-primary-container">
                    {album.albumCount} 套图集
                  </div>
                </div>
                <h3 className="truncate font-headline text-lg font-bold text-on-surface" title={album.name}>
                  {album.name}
                </h3>
                <p className="mt-2 text-sm text-outline">{album.assetCount} 张图片</p>
              </button>
            ))}
          </div>
        )}

        {pagination && totalPages > 1 && (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 md:mt-12 md:flex-row md:gap-4">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || isLoading}
              className="rounded-full bg-surface-container-high p-2 text-on-surface-variant transition-all hover:bg-primary-container disabled:opacity-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-center text-sm text-outline">
              第 {pagination.page} / {totalPages} 页，共 {pagination.total} 个自动整理
            </span>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages || isLoading}
              className="rounded-full bg-surface-container-high p-2 text-on-surface-variant transition-all hover:bg-primary-container disabled:opacity-50"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
