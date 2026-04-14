import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, ArrowRight, Loader2, ChevronLeft, ChevronRight, Trash2, Search, X, Images } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ThrottledImage } from './ThrottledImage';
import { deleteAlbum, useMobile } from '../hooks';
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
  const RENDER_CHUNK_SIZE = 72;
  const [visibleCount, setVisibleCount] = useState(RENDER_CHUNK_SIZE);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;
  const currentPage = pagination?.page || 1;
  const renderedAlbums = useMemo(() => albums.slice(0, visibleCount), [albums, visibleCount]);

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

  const handleNavigateToAlbum = (albumId: string) => {
    if (mainRef.current && onScrollPositionChange) {
      onScrollPositionChange(mainRef.current.scrollTop);
    }
    onNavigateToAlbum(albumId);
  };

  useEffect(() => {
    setVisibleCount(RENDER_CHUNK_SIZE);
  }, [albums.length, currentPage]);

  useEffect(() => {
    if (!loadMoreRef.current) {
      return;
    }

    if (visibleCount >= albums.length) {
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
        threshold: 0.01
      }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      observer.disconnect();
    };
  }, [albums.length, visibleCount]);

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
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    show: { 
      opacity: 1, 
      y: 0, 
      scale: 1, 
      transition: { type: 'spring', stiffness: 260, damping: 20 } 
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar 
        activeTab={activeTab} 
        onNavigate={onSidebarNavigate}
        onProfileClick={onProfileClick}
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
      
      <main ref={mainRef} className="md:ml-80 ml-0 flex-1 h-full overflow-y-auto custom-scrollbar bg-surface md:px-12 px-4 pt-12 md:pt-16 pb-24 relative">
        <header className="flex justify-between items-center w-full mb-4 md:mb-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl md:text-6xl text-on-surface tracking-tighter leading-tight font-script font-bold">瞬间图库</h1>
            <p className="text-base md:text-xl font-body text-outline/70 hidden md:block">更懂你的，也更懂在这里</p>
          </div>
          <div 
            onClick={onProfileClick}
            className="w-10 md:w-14 h-10 md:h-14 rounded-full border-2 md:border-4 border-white shadow-md md:shadow-xl overflow-hidden hover:scale-105 transition-transform cursor-pointer"
          >
            <img 
              alt="Curator Portrait" 
              className="w-full h-full object-cover" 
              src="https://picsum.photos/seed/portrait/200/200" 
            />
          </div>
        </header>

        <div className="mb-4">
          <button
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
            className="md:hidden flex items-center gap-2 px-4 py-2 bg-surface-container-high rounded-lg text-sm"
          >
            <span>筛选</span>
            <ChevronRight className={`w-4 h-4 transition-transform ${isFilterExpanded ? 'rotate-90' : ''}`} />
          </button>
          
          <div className={`${isFilterExpanded ? 'block' : 'hidden'} md:block`}>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-6 md:mb-8 p-3 md:p-4 bg-surface-container-highest rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-sm text-outline hidden sm:inline">来源:</span>
                <select 
                  value={currentSourceType}
                  onChange={(e) => onSourceTypeChange(e.target.value as 'folder' | 'zip' | '')}
                  className="px-2 md:px-3 py-2 bg-surface-container-high rounded-lg text-sm border-none outline-none cursor-pointer"
                >
                  <option value="">全部</option>
                  <option value="folder">文件夹</option>
                  <option value="zip">压缩包</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-outline hidden sm:inline">排序:</span>
                <select 
                  value={currentSortBy}
                  onChange={(e) => onSortByChange(e.target.value as 'name' | 'updatedAt' | 'assetCount')}
                  className="px-2 md:px-3 py-2 bg-surface-container-high rounded-lg text-sm border-none outline-none cursor-pointer"
                >
                  {sortOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => onSortOrderChange(currentSortOrder === 'asc' ? 'desc' : 'asc')}
                className="flex items-center gap-1 px-3 py-2 bg-surface-container-high rounded-lg text-sm hover:bg-primary-container/20 transition-colors"
              >
                {currentSortOrder === 'asc' ? '正序' : '倒序'}
              </button>

              <div className="flex items-center gap-2">
                <span className="text-sm text-outline">每页:</span>
                <select 
                  value={currentPageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="px-3 py-2 bg-surface-container-high rounded-lg text-sm border-none outline-none cursor-pointer"
                >
                  {pageSizeOptions.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1 w-full md:w-auto min-w-[150px] md:min-w-[200px] max-w-full md:max-w-[300px]">
                <input 
                  className="w-full bg-surface-container-high border-2 border-outline/30 rounded-full py-2 pl-10 pr-10 focus:ring-2 focus:ring-primary-container focus:border-transparent outline-none text-sm placeholder:text-outline/50" 
                  placeholder="Search moment"
                  type="text"
                  value={currentKeyword}
                  onChange={(e) => onKeywordChange(e.target.value)}
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline w-4 h-4" />
                {currentKeyword && (
                  <button 
                    onClick={() => onKeywordChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  onKeywordChange('');
                  onSourceTypeChange('');
                  onSortByChange('updatedAt');
                  onSortOrderChange('desc');
                  onPageSizeChange(24);
                }}
                className="flex items-center gap-1 px-4 py-2 bg-surface-container-high rounded-lg text-sm hover:bg-primary-container/20 transition-colors text-outline"
              >
                <X className="w-4 h-4" />
                重置
              </button>
            </div>
          </div>
        </div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-4 md:gap-6 w-full" 
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 160}px, 1fr))` }}
        >
          {isLoading && albums.length === 0 ? (
            Array.from({ length: isMobile ? 8 : 16 }).map((_, i) => (
              <div key={i} className="relative bg-surface-container-highest rounded-xl p-3 shadow-md animate-pulse">
                <div className="absolute top-2 right-2 px-4 py-1 rounded-full bg-outline/10 w-16 h-5" />
                <div className="aspect-square rounded-lg bg-outline/10 mb-5" />
                <div className="px-2 pb-2">
                  <div className="h-5 bg-outline/10 rounded w-3/4 mb-3" />
                  <div className="h-4 bg-outline/10 rounded w-1/2" />
                </div>
              </div>
            ))
          ) : albums.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="col-span-full flex flex-col items-center justify-center py-24 md:py-32 gap-6"
            >
              <div className="relative">
                <Images className="w-24 h-24 text-outline/20 stroke-[1]" />
                <motion.div 
                  animate={{ rotate: [0, 15, -5, 0] }} 
                  transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                  className="absolute -bottom-2 -right-2 bg-primary-container text-on-primary-container p-2.5 rounded-2xl shadow-lg -rotate-12"
                >
                  <Search className="w-6 h-6" />
                </motion.div>
              </div>
              <div className="text-center space-y-2">
                <p className="text-2xl font-bold text-on-surface font-headline tracking-tight">这里还是一片空白</p>
                <p className="text-sm text-outline/80">在左侧边栏找到“设置”，导入你的第一个瞬间图库吧</p>
              </div>
            </motion.div>
          ) : (
            renderedAlbums.map((album, idx) => {
              const colorScheme = tagColors[album.sourceType] || tagColors.folder;
              return (
                <motion.div 
                  key={album.id}
                  variants={itemVariants}
                  whileHover={{ scale: 1.03, rotate: idx % 2 === 0 ? 1 : -1, zIndex: 10 }}
                  className="group cursor-pointer"
                >
                  <div className="relative bg-surface-container-highest rounded-xl p-3 shadow-lg transition-all duration-300">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`确定要删除图集 "${album.name}" 吗？`)) {
                          const success = await deleteAlbum(album.id);
                          if (success) {
                            onAlbumDeleted?.();
                          }
                        }
                      }}
                      className="absolute top-2 right-2 z-20 p-2 rounded-full bg-red-400 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:scale-110 transition-all shadow-md"
                      title="删除图集"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div 
                      onClick={() => handleNavigateToAlbum(album.id)}
                      className="pointer-events-auto"
                    >
                      <div className={`absolute -top-3 ${idx % 2 === 0 ? '-right-2 rotate-12' : '-left-3 -rotate-12'} z-10 px-4 py-1 text-xs font-bold rounded-full shadow-sm border border-black/5 ${colorScheme.bg} ${colorScheme.text}`}>
                        {album.sourceType === 'folder' ? '文件夹' : '压缩包'}
                      </div>
                      <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden aspect-square">
                        {album.coverUrl ? (
                          <ThrottledImage
                            key="cover" 
                            className="col-span-3 w-full h-full object-cover" 
                            src={album.coverUrl} 
                            alt={album.name} 
                          />
                        ) : (
                          Array.from({ length: 9 }).map((_, i) => (
                            <div key={`empty-${i}`} className="bg-surface-container-high flex items-center justify-center">
                              <Plus className="w-6 h-6 text-outline/20" />
                            </div>
                          ))
                        )}
                      </div>
                      <div className="mt-4 px-2 pb-2">
                        <h3 className="text-base font-bold text-on-surface font-headline truncate leading-tight mb-1" title={album.name}>{album.name}</h3>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-outline tracking-wider uppercase">{album.assetCount} ITEMS</span>
                          <ArrowRight className="text-outline/30 group-hover:text-primary w-4 h-4 transition-colors group-hover:translate-x-1" />
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
          <div className="mt-8 md:mt-12 flex items-center justify-center gap-2 md:gap-4 flex-wrap">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1 || isLoading}
              className="p-2 md:p-2 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
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
                    className={`w-10 h-10 rounded-full text-sm font-medium transition-all ${
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
              className="p-2 md:p-2 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <span className="text-xs md:text-sm text-outline ml-2 md:ml-4">
              共 {pagination.total} 条 / {totalPages} 页
            </span>
          </div>
        )}
      </main>
    </div>
  );
};
