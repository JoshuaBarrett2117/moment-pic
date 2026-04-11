import type { FC } from 'react';
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Camera, Home, Heart, Sparkles, Leaf, PenTool, Paperclip, Loader2, Trash2 } from 'lucide-react';
import { Polaroid } from './Polaroid';
import { PhotoSwipeGallery } from './PhotoSwipeGallery';
import { useAlbumAssets, deleteAsset } from '../hooks';
import type { AssetListItemDTO } from '../types/api';

interface AlbumDetailScreenProps {
  albumId: string;
  onBack: () => void;
  onAssetDeleted?: () => void;
}

const PAGE_SIZE = 96;

export const AlbumDetailScreen: FC<AlbumDetailScreenProps> = ({ albumId, onBack, onAssetDeleted }) => {
  const { assets, isLoading, error, fetchAssets } = useAlbumAssets();
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [loadedItems, setLoadedItems] = useState<AssetListItemDTO[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadPage = useCallback(
    async (targetPage: number, append: boolean) => {
      if (!albumId) {
        return;
      }

      if (append) {
        setIsLoadingMore(true);
      }

      const result = await fetchAssets(albumId, { page: targetPage, pageSize: PAGE_SIZE });

      if (result) {
        setCurrentPage(result.pagination.page);
        setTotalItems(result.pagination.total);
        setLoadedItems((prev) => {
          if (!append) {
            return result.items;
          }

          const existingIds = new Set(prev.map((item) => item.id));
          const nextItems = result.items.filter((item) => !existingIds.has(item.id));
          return [...prev, ...nextItems];
        });
      }

      if (append) {
        setIsLoadingMore(false);
      }
    },
    [albumId, fetchAssets]
  );

  useEffect(() => {
    setLoadedItems([]);
    setCurrentPage(0);
    setTotalItems(0);

    if (albumId) {
      void loadPage(1, false);
    }
  }, [albumId, loadPage]);

  const handleImageClick = useCallback((index: number) => {
    setSelectedImageIndex(index);
  }, []);

  const closeViewer = useCallback(() => {
    setSelectedImageIndex(null);
  }, []);

  const hasMore = loadedItems.length < totalItems;

  const handleLoadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) {
      return;
    }

    await loadPage(currentPage + 1, true);
  }, [currentPage, hasMore, isLoading, isLoadingMore, loadPage]);

  const handleReloadFirstPage = useCallback(async () => {
    await loadPage(1, false);
  }, [loadPage]);

  return (
    <div className="flex h-screen w-full bg-surface overflow-hidden">
      <aside className="w-[280px] bg-surface-container-low h-full flex flex-col px-6 pt-10 pb-8 z-10 relative overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center -rotate-3 shadow-sm">
            <Camera className="w-5 h-5 text-on-primary-container" />
          </div>
          <h1 className="text-xl font-headline font-extrabold tracking-tight text-primary">Moment Pic</h1>
        </div>

        <div className="mb-8 flex">
          <button
            onClick={onBack}
            className="bg-secondary-container text-on-secondary-container px-4 py-1.5 rounded-sm text-xs font-medium rotate-1 shadow-sm wobbly-mask flex items-center gap-1 hover:brightness-95 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </button>
        </div>

        <div className="flex flex-col items-center gap-16 mt-4">
          <Heart className="w-10 h-10 text-primary opacity-40 rotate-12 fill-primary" />
          <Sparkles className="w-8 h-8 text-primary opacity-30 -rotate-8 self-start ml-8" />
          <Leaf className="w-6 h-6 text-primary opacity-40 rotate-6 self-end mr-8" />
        </div>

        <div className="mt-auto opacity-20 text-primary self-center">
          <PenTool className="w-12 h-12 -rotate-12" />
        </div>

        <div className="mt-auto bg-tertiary-container p-6 rounded-2xl -rotate-2 shadow-sm relative wobbly-mask">
          <Paperclip className="absolute -top-3 right-4 text-outline rotate-12 w-5 h-5" />
          {assets?.album ? (
            <>
              <p className="text-sm font-medium text-on-tertiary-container leading-relaxed">
                共 {assets.album.assetCount} 张图片
              </p>
              <p className="text-[10px] mt-2 text-on-tertiary-container/60">
                已加载 {loadedItems.length} 张
              </p>
              <p className="text-[10px] mt-1 text-on-tertiary-container/60">
                更新于 {new Date(assets.album.updatedAt || Date.now()).toLocaleDateString('zh-CN')}
              </p>
            </>
          ) : (
            <p className="text-sm font-medium text-on-tertiary-container leading-relaxed">加载中...</p>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full bg-surface relative">
        <header className="h-32 flex flex-col justify-center px-12 pt-8">
          <h2 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">
            {assets?.album?.name || albumId} - 相册详情
          </h2>
        </header>

        <section className="flex-1 overflow-y-auto px-12 py-8 custom-scrollbar scroll-smooth">
          {isLoading && loadedItems.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-12 h-12 animate-spin text-outline" />
            </div>
          ) : error && loadedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <p className="text-error">{error}</p>
              <button onClick={handleReloadFirstPage} className="px-4 py-2 bg-primary-container text-on-primary-container rounded-lg">
                重试
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {loadedItems.map((asset, i) => (
                  <div key={asset.id} className="group relative cursor-pointer hover:opacity-90 transition-opacity">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`确定要删除图片 \"${asset.name}\" 吗？`)) {
                          const success = await deleteAsset(asset.id);
                          if (success) {
                            onAssetDeleted?.();
                            await loadPage(1, false);
                          }
                        }
                      }}
                      className="absolute top-2 right-2 z-20 p-2 rounded-full bg-red-500/80 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
                      title="删除图片"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div onClick={() => handleImageClick(i)}>
                      <Polaroid src={asset.thumbnailUrl} caption="" rotation={(i % 5 - 2) * 1} className="w-full" />
                    </div>
                  </div>
                ))}
              </div>

              {hasMore && (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={isLoadingMore || isLoading}
                    className="px-6 py-3 rounded-lg bg-primary-container text-on-primary-container font-medium disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isLoadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {isLoadingMore ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <footer className="h-20 px-12 border-t-2 border-outline/5 flex items-center justify-between bg-surface/50 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3 text-outline-variant/80">
            <Paperclip className="w-4 h-4" />
            <code className="text-xs font-medium tracking-tight">/Volume1/pb1/{albumId}/moments/</code>
          </div>
        </footer>
      </main>

      <PhotoSwipeGallery items={loadedItems} isOpen={selectedImageIndex !== null} initialIndex={selectedImageIndex || 0} onClose={closeViewer} />

      <nav className="fixed bottom-0 w-full z-50 flex justify-around items-center px-6 pb-6 pt-2 md:hidden bg-white/80 backdrop-blur-xl shadow-lg rounded-t-[3rem]">
        <button onClick={onBack} className="flex flex-col items-center text-outline hover:opacity-80 transition-opacity">
          <Home className="w-6 h-6" />
          <span className="text-[10px] uppercase tracking-widest">Home</span>
        </button>
        <button onClick={onBack} className="flex flex-col items-center text-outline hover:opacity-80 transition-opacity">
          <ArrowLeft className="w-6 h-6" />
          <span className="text-[10px] uppercase tracking-widest">Back</span>
        </button>
      </nav>
    </div>
  );
};
