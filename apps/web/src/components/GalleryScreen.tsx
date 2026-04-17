import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, ArrowRight, ChevronLeft, ChevronRight, Trash2, Search, X, Images } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useToast } from './Toast';
import { ThrottledImage } from './ThrottledImage';
import { deleteAlbum, useMobile, useSystemConfig } from '../hooks';
import type { AlbumListItemDTO, PaginationDTO, LibraryRootDTO } from '../types/api';

interface GalleryScreenProps {
  albums: AlbumListItemDTO[];
  isLoading: boolean;
  pagination: PaginationDTO | null;
  onNavigateToAlbum: (albumId: string) => void;
  onProfileClick: () => void;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
  onSortByChange: (sortBy: 'name' | 'updatedAt' | 'assetCount') => void;
  onSortOrderChange: (sortOrder: 'asc' | 'desc') => void;
  onPageSizeChange: (pageSize: number) => void;
  onSourceTypeChange: (sourceType: 'folder' | 'zip' | '') => void;
  currentSortBy: 'name' | 'updatedAt' | 'assetCount';
  currentSortOrder: 'asc' | 'desc';
  currentPageSize: number;
  currentSourceType: 'folder' | 'zip' | '';
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
}

const tagColors: Record<string, { bg: string; text: string }> = {
  folder: { bg: 'bg-[#D4E8CF]', text: 'text-on-secondary-container' },
  zip: { bg: 'bg-[#EDC3B9]', text: 'text-on-primary-container' },
};

const DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_MOBILE = 160;
const DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_DESKTOP = 300;
const RENDER_CHUNK_SIZE = 72;

export const GalleryScreen: React.FC<GalleryScreenProps> = ({
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
  onAlbumDeleted,
  onRecentClick,
  isRecentActive,
  scrollPosition,
  onScrollPositionChange,
}) => {
  const isMobile = useMobile();
  const { systemConfig, fetchSystemConfig } = useSystemConfig();
  const { toast } = useToast();
  const [visibleCount, setVisibleCount] = useState(RENDER_CHUNK_SIZE);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [pendingDeleteAlbum, setPendingDeleteAlbum] = useState<AlbumListItemDTO | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;
  const currentPage = pagination?.page || 1;
  const renderedAlbums = useMemo(() => albums.slice(0, visibleCount), [albums, visibleCount]);
  const hasActiveFilters =
    Boolean(currentKeyword || currentSourceType || currentLibraryRootId) ||
    currentSortBy !== 'updatedAt' ||
    currentSortOrder !== 'desc' ||
    currentPageSize !== 24;
  const albumListItemMinWidth = isMobile
    ? (systemConfig?.albumListItemMinWidthMobile ?? DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_MOBILE)
    : (systemConfig?.albumListItemMinWidthDesktop ?? DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_DESKTOP);

  useEffect(() => {
    if (scrollPosition !== undefined && mainRef.current) {
      mainRef.current.scrollTop = scrollPosition;
    }
  }, [scrollPosition]);

  useEffect(() => {
    if (isMobile) {
      setIsFilterExpanded(false);
    }
  }, [isMobile]);

  useEffect(() => {
    void fetchSystemConfig();
  }, [fetchSystemConfig]);

  useEffect(() => {
    setVisibleCount(RENDER_CHUNK_SIZE);
  }, [albums.length, currentPage]);

  useEffect(() => {
    if (!loadMoreRef.current || visibleCount >= albums.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }

        setVisibleCount((prev) => Math.min(prev + RENDER_CHUNK_SIZE, albums.length));
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
  }, [albums.length, visibleCount]);

  const handleNavigateToAlbum = (albumId: string) => {
    if (mainRef.current && onScrollPositionChange) {
      onScrollPositionChange(mainRef.current.scrollTop);
    }

    onNavigateToAlbum(albumId);
  };

  const sortOptions = [
    { value: 'name', label: '名称' },
    { value: 'updatedAt', label: '更新时间' },
    { value: 'assetCount', label: '图片数量' },
  ];

  const pageSizeOptions = [12, 24, 48, 96];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: 'spring', stiffness: 260, damping: 20 },
    },
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onNavigate={onSidebarNavigate}
        libraryRoots={libraryRoots}
        currentLibraryRootId={currentLibraryRootId}
        onLibraryRootChange={onLibraryRootChange}
        onScanAll={onScanAll}
        onScanOne={onScanOne}
        isAnyScanning={isAnyScanning}
        isScanning={isScanning}
        albumCount={pagination?.total || 0}
        onRecentClick={onRecentClick}
        isRecentActive={isRecentActive}
      />

      <main
        ref={mainRef}
        className="relative h-full flex-1 overflow-y-auto bg-surface px-4 pt-12 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] custom-scrollbar md:ml-80 md:px-12 md:pt-16 md:pb-24"
      >
        <header className="relative z-10 -mx-4 mb-4 flex w-auto items-center justify-between bg-surface/92 px-4 py-3 md:mx-0 md:mb-8 md:bg-transparent md:px-0 md:py-0">
          <div className="flex flex-col gap-1">
            <h1 className="font-script text-2xl font-bold leading-tight tracking-tighter text-on-surface md:text-6xl">
              瞬间图库
            </h1>
            <p className="hidden font-body text-base text-outline/70 md:block md:text-xl">
              更懂你的，也更懂你如何整理回忆
            </p>
          </div>
          <button
            onClick={onProfileClick}
            title="Logout"
            className="h-11 w-11 cursor-pointer overflow-hidden rounded-full border-2 border-white shadow-md transition-transform hover:scale-105 md:h-14 md:w-14 md:border-4 md:shadow-xl"
          >
            <img
              alt="Logout"
              className="h-full w-full object-cover"
              src="https://picsum.photos/seed/portrait/200/200"
            />
          </button>
        </header>

        <div className="mb-4">
          <button
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
            className="flex items-center gap-2 rounded-lg bg-surface-container-high px-4 py-2 text-sm md:hidden"
          >
            <span>筛选</span>
            <ChevronRight className={`h-4 w-4 transition-transform ${isFilterExpanded ? 'rotate-90' : ''}`} />
          </button>

          <div className={`${isFilterExpanded ? 'block' : 'hidden'} md:block`}>
            <div className="mb-6 rounded-2xl bg-surface-container-highest p-3 shadow-sm md:mb-8 md:p-4">
              <div className="relative mb-3 w-full">
                <input
                  className="w-full rounded-full border-2 border-outline/30 bg-surface-container-high py-2 pl-10 pr-10 text-sm outline-none placeholder:text-outline/50 focus:border-transparent focus:ring-2 focus:ring-primary-container"
                  placeholder="搜索相册名称"
                  type="text"
                  value={currentKeyword}
                  onChange={(e) => onKeywordChange(e.target.value)}
                />
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
                {currentKeyword && (
                  <button
                    onClick={() => onKeywordChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-outline transition-colors hover:text-on-surface"
                    title="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 md:gap-4">
                <div className="flex items-center gap-2">
                  <span className="hidden text-sm text-outline sm:inline">来源:</span>
                  <select
                    value={currentSourceType}
                    onChange={(e) => onSourceTypeChange(e.target.value as 'folder' | 'zip' | '')}
                    className="cursor-pointer rounded-lg bg-surface-container-high px-2 py-2 text-sm outline-none md:px-3"
                  >
                    <option value="">全部</option>
                    <option value="folder">文件夹</option>
                    <option value="zip">压缩包</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="hidden text-sm text-outline sm:inline">排序:</span>
                  <select
                    value={currentSortBy}
                    onChange={(e) => onSortByChange(e.target.value as 'name' | 'updatedAt' | 'assetCount')}
                    className="cursor-pointer rounded-lg bg-surface-container-high px-2 py-2 text-sm outline-none md:px-3"
                  >
                    {sortOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => onSortOrderChange(currentSortOrder === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center gap-1 rounded-lg bg-surface-container-high px-3 py-2 text-sm transition-colors hover:bg-primary-container/20"
                >
                  {currentSortOrder === 'asc' ? '正序' : '倒序'}
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-outline">每页:</span>
                  <select
                    value={currentPageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    className="cursor-pointer rounded-lg bg-surface-container-high px-3 py-2 text-sm outline-none"
                  >
                    {pageSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => {
                    onKeywordChange('');
                    onSourceTypeChange('');
                    onSortByChange('updatedAt');
                    onSortOrderChange('desc');
                    onPageSizeChange(24);
                    onRefresh();
                  }}
                  className="ml-auto flex items-center gap-1 px-2 py-2 text-sm text-outline transition-colors hover:text-on-surface"
                >
                  <X className="h-4 w-4" />
                  清空筛选
                </button>
              </div>
            </div>
          </div>
        </div>

        {isLoading && albums.length > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-outline/10 bg-surface-container-high px-4 py-3 text-sm text-outline shadow-sm md:mb-6">
            <span>正在更新筛选结果...</span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
              请稍候
            </span>
          </div>
        )}

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid w-full gap-4 md:gap-6"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${albumListItemMinWidth}px, 1fr))` }}
        >
          {isLoading && albums.length === 0 ? (
            Array.from({ length: isMobile ? 8 : 16 }).map((_, i) => (
              <div key={i} className="animate-pulse relative rounded-xl bg-surface-container-highest p-4 shadow-md">
                <div className="absolute right-2 top-2 h-5 w-16 rounded-full bg-outline/10 px-4 py-1" />
                <div className="mb-5 aspect-square rounded-lg bg-outline/10" />
                <div className="px-2 pb-2">
                  <div className="mb-3 h-6 w-3/4 rounded bg-outline/10" />
                  <div className="h-4 w-1/2 rounded bg-outline/10" />
                </div>
              </div>
            ))
          ) : albums.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="col-span-full flex flex-col items-center justify-center gap-6 py-24 md:py-32"
            >
              <div className="relative">
                <Images className="h-24 w-24 stroke-[1] text-outline/20" />
                <motion.div
                  animate={{ rotate: [0, 15, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                  className="absolute -bottom-2 -right-2 -rotate-12 rounded-2xl bg-primary-container p-2.5 text-on-primary-container shadow-lg"
                >
                  <Search className="h-6 w-6" />
                </motion.div>
              </div>
                            <div className="space-y-2 text-center">
                <p className="font-headline text-2xl font-bold tracking-tight text-on-surface">
                  {hasActiveFilters ? '没有找到匹配的相册' : '这里还是一片空白'}
                </p>
                <p className="text-sm text-outline/80">
                  {hasActiveFilters
                    ? '试试清空筛选条件，或者换一个关键词。'
                    : '去左侧边栏找到“设置”，导入你的第一个瞬间图库吧。'}
                </p>
              </div>
            </motion.div>
          ) : (
            renderedAlbums.map((album, idx) => {
              const colorScheme = tagColors[album.sourceType] || tagColors.folder;

              return (
                <motion.div
                  key={album.id}
                  variants={itemVariants}
                  whileHover={isMobile ? undefined : { scale: 1.015, rotate: idx % 2 === 0 ? 0.35 : -0.35, zIndex: 10 }}
                  className="group cursor-pointer"
                >
                  <div className="relative rounded-xl bg-surface-container-highest p-4 shadow-lg transition-all duration-300 hover:shadow-xl">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteAlbum(album);
                      }}
                      className="absolute right-2 top-2 z-20 rounded-full bg-red-400 p-2.5 text-white opacity-100 shadow-md transition-all hover:scale-105 hover:bg-red-500 md:opacity-0 md:group-hover:opacity-100"
                      title="Delete album"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div onClick={() => handleNavigateToAlbum(album.id)} className="pointer-events-auto">
                      <div
                        className={`absolute -top-3 z-10 rounded-full border border-black/5 px-4 py-1 text-xs font-bold shadow-sm ${
                          idx % 2 === 0 ? '-right-2 rotate-12' : '-left-3 -rotate-12'
                        } ${colorScheme.bg} ${colorScheme.text}`}
                      >
                        {album.sourceType === 'folder' ? '文件夹' : '压缩包'}
                      </div>
                      <div className="grid aspect-square grid-cols-3 gap-1.5 overflow-hidden rounded-xl">
                        {album.coverUrl ? (
                          <ThrottledImage
                            key="cover"
                            className="col-span-3 h-full w-full object-cover"
                            src={album.coverUrl}
                            alt={album.name}
                          />
                        ) : (
                          Array.from({ length: 9 }).map((_, emptyIndex) => (
                            <div key={`empty-${emptyIndex}`} className="flex items-center justify-center bg-surface-container-high">
                              <Plus className="h-6 w-6 text-outline/20" />
                            </div>
                          ))
                        )}
                      </div>
                      <div className="mt-4 px-2 pb-2">
                        <h3 className="mb-1 truncate font-headline text-lg font-bold leading-tight text-on-surface" title={album.name}>
                          {album.name}
                        </h3>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold uppercase tracking-wider text-outline">{album.assetCount} items</span>
                          <ArrowRight className="h-4 w-4 text-outline/30 transition-all group-hover:translate-x-1 group-hover:text-primary" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </motion.div>

        {renderedAlbums.length < albums.length && (
          <div ref={loadMoreRef} className="w-full py-6 text-center text-sm text-outline/70">
            正在加载更多相册...
          </div>
        )}

        {pagination && totalPages > 1 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 md:mt-12 md:gap-4">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1 || isLoading}
              className="rounded-full bg-surface-container-high p-2 text-on-surface-variant transition-all hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
              title="Previous page"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;

                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => onPageChange(pageNum)}
                    className={`h-10 w-10 rounded-full text-sm font-medium transition-all ${
                      currentPage === pageNum
                        ? 'bg-primary-container text-on-primary-container'
                        : 'text-outline hover:bg-primary-container/20'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || isLoading}
              className="rounded-full bg-surface-container-high p-2 text-on-surface-variant transition-all hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
              title="Next page"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <span className="ml-2 text-xs text-outline md:ml-4 md:text-sm">
              共 {pagination.total} 页 / {totalPages} 页
            </span>
          </div>
        )}

        {pendingDeleteAlbum && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 px-4">
            <div className="w-full max-w-md rounded-3xl border border-outline/10 bg-surface p-6 shadow-2xl">
              <h3 className="font-headline text-xl font-black text-on-surface">确认删除相册</h3>
              <p className="mt-3 text-sm leading-6 text-outline">
                删除后将无法在图库中继续浏览
                <span className="font-semibold text-on-surface">{pendingDeleteAlbum.name}</span>
                ，请确认此操作。
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setPendingDeleteAlbum(null)}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-outline transition-colors hover:bg-surface-container-high"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    const targetAlbum = pendingDeleteAlbum;
                    setPendingDeleteAlbum(null);
                    const success = await deleteAlbum(targetAlbum.id);

                    if (success) {
                      toast('Album deleted', 'success');
                      onAlbumDeleted?.();
                      return;
                    }

                    toast('删除相册失败，请稍后重试', 'error');
                  }}
                  className="rounded-full bg-error px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-95"
                >
                  删除相册
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

