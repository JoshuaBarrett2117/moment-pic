import React from 'react';
import { motion } from 'motion/react';
import { Filter, Plus, ArrowRight, Loader2, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { deleteAlbum } from '../hooks';
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
}) => {
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;
  const currentPage = pagination?.page || 1;

  const sortOptions = [
    { value: 'name', label: '名称' },
    { value: 'updatedAt', label: '更新时间' },
    { value: 'assetCount', label: '图片数量' },
  ];

  const pageSizeOptions = [12, 24, 48, 96];

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
        currentKeyword={currentKeyword}
        onKeywordChange={onKeywordChange}
      />
      
      <main className="ml-80 flex-1 h-full overflow-y-auto custom-scrollbar bg-surface px-12 pt-16 pb-24 relative">
        <header className="flex justify-between items-start w-full mb-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-6xl text-on-surface tracking-tighter leading-tight font-script font-bold">瞬间图库</h1>
            <p className="text-xl font-body text-outline/70">更懂你的，也更懂在这里</p>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={onRefresh}
              className="p-4 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container transition-all"
            >
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Filter className="w-6 h-6" />}
            </button>
            <div 
              onClick={onProfileClick}
              className="w-14 h-14 rounded-full border-4 border-white shadow-xl overflow-hidden hover:scale-105 transition-transform cursor-pointer"
            >
              <img 
                alt="Curator Portrait" 
                className="w-full h-full object-cover" 
                src="https://picsum.photos/seed/portrait/200/200" 
              />
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-4 mb-8 p-4 bg-surface-container-highest rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-sm text-outline">来源:</span>
            <select 
              value={currentSourceType}
              onChange={(e) => onSourceTypeChange(e.target.value as 'folder' | 'zip' | '')}
              className="px-3 py-2 bg-surface-container-high rounded-lg text-sm border-none outline-none cursor-pointer"
            >
              <option value="">全部</option>
              <option value="folder">文件夹</option>
              <option value="zip">压缩包</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-outline">排序:</span>
            <select 
              value={currentSortBy}
              onChange={(e) => onSortByChange(e.target.value as 'name' | 'updatedAt' | 'assetCount')}
              className="px-3 py-2 bg-surface-container-high rounded-lg text-sm border-none outline-none cursor-pointer"
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
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {isLoading && albums.length === 0 ? (
            <div className="col-span-full flex items-center justify-center py-20">
              <Loader2 className="w-12 h-12 animate-spin text-outline" />
            </div>
          ) : albums.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 gap-4">
              <p className="text-xl text-outline">暂无相册</p>
              <p className="text-sm text-outline/70">请在设置页面添加库目录并扫描</p>
            </div>
          ) : (
            albums.map((album, idx) => {
              const colorScheme = tagColors[album.sourceType] || tagColors.folder;
              return (
                <motion.div 
                  key={album.id}
                  whileHover={{ scale: 1.03, rotate: idx % 2 === 0 ? 1 : -1 }}
                  className="group cursor-pointer"
                >
                  <div className="relative bg-surface-container-highest rounded-xl p-3 shadow-lg transition-all duration-500">
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
                      className="absolute top-2 right-2 z-20 p-2 rounded-full bg-red-500/80 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
                      title="删除图集"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div 
                      onClick={() => onNavigateToAlbum(album.id)}
                      className="pointer-events-auto"
                    >
                      <div className={`absolute -top-3 ${idx % 2 === 0 ? '-right-2 rotate-12' : '-left-3 -rotate-12'} z-10 px-4 py-1 text-xs font-bold rounded-full shadow-sm border border-black/5 ${colorScheme.bg} ${colorScheme.text}`}>
                        {album.sourceType === 'folder' ? '文件夹' : '压缩包'}
                      </div>
                      <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden aspect-square">
                        {album.coverUrl ? (
                          <img 
                            key="cover" 
                            className="col-span-3 w-full h-full object-cover" 
                            src={album.coverUrl} 
                            alt={album.name} 
                            loading="lazy"
                            decoding="async"
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
                        <h3 className="text-base font-bold text-on-surface font-headline truncate">{album.name}</h3>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs font-medium text-outline">{album.assetCount} images</span>
                          <ArrowRight className="text-outline/30 group-hover:text-primary w-4 h-4 transition-colors" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {pagination && totalPages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-4">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1 || isLoading}
              className="p-2 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
              className="p-2 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <span className="text-sm text-outline ml-4">
              共 {pagination.total} 条 / {totalPages} 页
            </span>
          </div>
        )}
      </main>
    </div>
  );
};
