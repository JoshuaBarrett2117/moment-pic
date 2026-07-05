import { type FC, useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Camera, Heart, Sparkles, Leaf, PenTool, Paperclip, Loader2, RefreshCw, Share2, Star } from 'lucide-react';
import { Polaroid } from './Polaroid';
import { AlbumShareDialog } from './AlbumShareDialog';
import { useToast } from './Toast';
import { ViewerGallery } from './ViewerGallery';
import { useAlbumAssets, rescanAlbum, setAlbumFavorite, useMobile, useSystemConfig, useWideMobile } from '../hooks';
import type { AssetListItemDTO } from '../types/api';

interface AlbumDetailScreenProps {
  mode?: 'album' | 'share';
  albumId: string;
  onBack: () => void;
  onRequestNextAlbum?: () => void;
}

const PAGE_SIZE = 24;
const RENDER_CHUNK_SIZE = 96;
const DEFAULT_PRELOAD_BEFORE = 2;
const DEFAULT_PRELOAD_AFTER = 3;
const DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_MOBILE = 160;
const DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_DESKTOP = 300;

export const AlbumDetailScreen: FC<AlbumDetailScreenProps> = ({ albumId, onBack, onRequestNextAlbum }) => {
  const isMobile = useMobile();
  const isWideMobile = useWideMobile();
  const { assets, isLoading, error, fetchAssets } = useAlbumAssets();
  const { systemConfig, fetchSystemConfig } = useSystemConfig();
  const { toast } = useToast();
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [loadedItems, setLoadedItems] = useState<AssetListItemDTO[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRescanningAlbum, setIsRescanningAlbum] = useState(false);
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [visibleRenderCount, setVisibleRenderCount] = useState(RENDER_CHUNK_SIZE);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const loadedItemsRef = useRef<AssetListItemDTO[]>([]);

  useEffect(() => {
    loadedItemsRef.current = loadedItems;
  }, [loadedItems]);

  const loadPage = useCallback(
    async (targetPage: number, append: boolean): Promise<boolean> => {
      if (!albumId) {
        return false;
      }

      if (append) {
        setIsLoadingMore(true);
      }

      const result = await fetchAssets(albumId, { page: targetPage, pageSize: PAGE_SIZE });

      if (!result) {
        if (append) {
          setIsLoadingMore(false);
        }
        return false;
      }

      const existingIds = append ? new Set(loadedItemsRef.current.map((item) => item.id)) : new Set<string>();
      const nextItems = append
        ? result.items.filter((item) => !existingIds.has(item.id))
        : result.items;

      setCurrentPage(result.pagination.page);
      setTotalItems(result.pagination.total);
      setLoadedItems((prev) => {
        if (!append) {
          return result.items;
        }

        const prevIds = new Set(prev.map((item) => item.id));
        const deduplicatedNextItems = result.items.filter((item) => !prevIds.has(item.id));
        return [...prev, ...deduplicatedNextItems];
      });

      if (append) {
        setIsLoadingMore(false);
      }

      return nextItems.length > 0;
    },
    [albumId, fetchAssets]
  );

  useEffect(() => {
    setLoadedItems([]);
    loadedItemsRef.current = [];
    setCurrentPage(0);
    setTotalItems(0);
    setVisibleRenderCount(RENDER_CHUNK_SIZE);
    setSelectedImageIndex(null);

    if (albumId) {
      void loadPage(1, false);
    }
  }, [albumId, loadPage]);

  useEffect(() => {
    void fetchSystemConfig();
  }, [fetchSystemConfig]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    const target = loadMoreTriggerRef.current;
    const hasMore = loadedItems.length < totalItems;
    const hasMoreToRender = visibleRenderCount < loadedItems.length;

    if ((!hasMore && !hasMoreToRender) || isLoading || isLoadingMore || !root || !target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) {
          return;
        }

        if (hasMoreToRender) {
          setVisibleRenderCount((prev) => Math.min(prev + RENDER_CHUNK_SIZE, loadedItems.length));
          return;
        }

        void loadPage(currentPage + 1, true);
      },
      {
        root,
        rootMargin: '0px 0px 240px 0px',
        threshold: 0.1,
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [currentPage, isLoading, isLoadingMore, loadedItems, totalItems, visibleRenderCount, loadPage]);

  const preloadBefore = systemConfig?.preloadBefore ?? DEFAULT_PRELOAD_BEFORE;
  const preloadAfter = systemConfig?.preloadAfter ?? DEFAULT_PRELOAD_AFTER;
  const albumDetailItemMinWidth = isMobile
    ? (isWideMobile
      ? (systemConfig?.albumDetailItemMinWidthDesktop ?? DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_DESKTOP)
      : (systemConfig?.albumDetailItemMinWidthMobile ?? DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_MOBILE))
    : (systemConfig?.albumDetailItemMinWidthDesktop ?? DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_DESKTOP);
  const mobileHeaderClass = isWideMobile
    ? 'sticky top-0 z-20 flex h-16 items-center justify-between border-b border-outline/10 bg-surface/92 px-6 pt-4 backdrop-blur-md'
    : 'sticky top-0 z-20 flex h-16 items-center justify-between border-b border-outline/10 bg-surface/92 px-4 pt-4 backdrop-blur-md';
  const mobileSectionClass = isWideMobile
    ? 'custom-scrollbar flex-1 overflow-y-auto px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] scroll-smooth'
    : 'custom-scrollbar flex-1 overflow-y-auto px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] scroll-smooth';
  const renderedItems = loadedItems.slice(0, visibleRenderCount);
  const hasMore = loadedItems.length < totalItems;
  const hasMoreToRender = visibleRenderCount < loadedItems.length;

  const handleReloadFirstPage = useCallback(async () => {
    await loadPage(1, false);
  }, [loadPage]);

  const handleRescanAlbum = useCallback(async () => {
    if (!albumId || isRescanningAlbum) {
      return;
    }

    setIsRescanningAlbum(true);
    const success = await rescanAlbum(albumId);
    if (!success) {
      toast('重扫图集失败，请稍后重试', 'error');
      setIsRescanningAlbum(false);
      return;
    }

    await loadPage(1, false);
    toast('图集已重新扫描', 'success');
    setIsRescanningAlbum(false);
  }, [albumId, isRescanningAlbum, loadPage, toast]);

  const handleFavoriteToggle = useCallback(async () => {
    if (!albumId || isUpdatingFavorite) {
      return;
    }

    setIsUpdatingFavorite(true);
    const result = await setAlbumFavorite(albumId, !(assets?.album?.isFavorite ?? false));
    if (!result) {
      toast('更新收藏失败，请稍后重试', 'error');
      setIsUpdatingFavorite(false);
      return;
    }

    await loadPage(1, false);
    toast(result.isFavorite ? '已收藏图集' : '已取消收藏', 'success');
    setIsUpdatingFavorite(false);
  }, [albumId, assets?.album?.isFavorite, isUpdatingFavorite, loadPage, toast]);

  const handleLoadMoreForViewer = useCallback(async (): Promise<boolean> => {
    if (isLoadingMore || loadedItems.length >= totalItems) {
      return false;
    }

    return loadPage(currentPage + 1, true);
  }, [currentPage, isLoadingMore, loadedItems.length, loadPage, totalItems]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-surface">
      {!isMobile && (
        <aside className="relative z-10 flex h-full w-[280px] flex-col overflow-y-auto bg-surface-container-low px-6 pt-10 pb-8 custom-scrollbar">
          <div className="mb-10 flex items-center gap-3">
            <div className="-rotate-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container shadow-sm">
              <Camera className="h-5 w-5 text-on-primary-container" />
            </div>
            <h1 className="font-headline text-xl font-extrabold tracking-tight text-primary">Moment Pic</h1>
          </div>

          <div className="mb-8 flex">
            <button
              onClick={onBack}
              className="wobbly-mask flex items-center gap-1 rounded-sm bg-secondary-container px-4 py-1.5 text-xs font-medium text-on-secondary-container shadow-sm transition-all hover:brightness-95"
            >
              <ArrowLeft className="h-4 w-4" />
              返回首页
            </button>
          </div>

          <div className="mb-8 flex flex-col gap-3">
            <button
              onClick={() => void handleFavoriteToggle()}
              disabled={isUpdatingFavorite}
              className="wobbly-mask flex items-center gap-1 rounded-sm bg-secondary-container px-4 py-1.5 text-xs font-medium text-on-secondary-container shadow-sm transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isUpdatingFavorite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className={`h-4 w-4 ${assets?.album?.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />}
              {assets?.album?.isFavorite ? '取消收藏' : '收藏图集'}
            </button>
            <button
              onClick={() => setIsShareDialogOpen(true)}
              className="wobbly-mask flex items-center gap-1 rounded-sm bg-tertiary-container px-4 py-1.5 text-xs font-medium text-on-tertiary-container shadow-sm transition-all hover:brightness-95"
            >
              <Share2 className="h-4 w-4" />
              分享图集
            </button>
          </div>

          <div className="mb-8 flex">
            <button
              onClick={() => void handleRescanAlbum()}
              disabled={isRescanningAlbum}
              className="wobbly-mask flex items-center gap-1 rounded-sm bg-primary-container px-4 py-1.5 text-xs font-medium text-on-primary-container shadow-sm transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isRescanningAlbum ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              重扫当前图集
            </button>
          </div>

          <div className="mt-4 flex flex-col items-center gap-16">
            <Heart className="h-10 w-10 rotate-12 fill-primary text-primary opacity-40" />
            <Sparkles className="ml-8 h-8 w-8 -rotate-8 self-start text-primary opacity-30" />
            <Leaf className="mr-8 h-6 w-6 rotate-6 self-end text-primary opacity-40" />
          </div>

          <div className="mt-auto self-center text-primary opacity-20">
            <PenTool className="-rotate-12 h-12 w-12" />
          </div>

          <div className="wobbly-mask relative mt-auto -rotate-2 rounded-2xl bg-tertiary-container p-6 shadow-sm">
            <Paperclip className="absolute -top-3 right-4 h-5 w-5 rotate-12 text-outline" />
            {assets?.album ? (
              <>
                <p className="text-sm font-medium leading-relaxed text-on-tertiary-container">共 {assets.album.assetCount} 张图片</p>
                <p className="mt-2 text-[10px] text-on-tertiary-container/60">已加载 {loadedItems.length} 张</p>
                <p className="mt-1 text-[10px] text-on-tertiary-container/60">
                  更新于 {new Date(assets.album.updatedAt || Date.now()).toLocaleDateString('zh-CN')}
                </p>
              </>
            ) : (
              <p className="text-sm font-medium leading-relaxed text-on-tertiary-container">加载中...</p>
            )}
          </div>
        </aside>
      )}

      <main className={`relative flex h-full flex-1 flex-col bg-surface ${isMobile ? 'w-full' : ''}`}>
        {isMobile && (
          <header className={mobileHeaderClass}>
            <button onClick={onBack} className="flex min-h-11 items-center gap-1.5 text-outline transition-colors hover:text-on-surface">
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm">返回</span>
            </button>
            <h2 className={`truncate font-headline font-bold tracking-tight text-on-surface ${isWideMobile ? 'max-w-[280px] text-xl' : 'max-w-[200px] text-lg'}`}>
              {assets?.album?.name || albumId}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => void handleFavoriteToggle()}
                disabled={isUpdatingFavorite}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-60"
                title={assets?.album?.isFavorite ? '取消收藏' : '收藏图集'}
              >
                {isUpdatingFavorite ? <Loader2 className="h-5 w-5 animate-spin" /> : <Star className={`h-5 w-5 ${assets?.album?.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />}
              </button>
              <button
                onClick={() => setIsShareDialogOpen(true)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
                title="分享图集"
              >
                <Share2 className="h-5 w-5" />
              </button>
              <button
                onClick={() => void handleRescanAlbum()}
                disabled={isRescanningAlbum}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-60"
                title="重扫当前图集"
              >
                {isRescanningAlbum ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
              </button>
            </div>
          </header>
        )}

        {!isMobile && (
          <header className="flex h-32 flex-col justify-center px-12 pt-8">
            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">
              {assets?.album?.name || albumId} · 相册详情
            </h2>
          </header>
        )}

        <section
          ref={scrollContainerRef}
          className={isMobile ? mobileSectionClass : 'custom-scrollbar flex-1 overflow-y-auto px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] scroll-smooth md:px-12 md:py-8 md:pb-8'}
        >
          {isLoading && loadedItems.length === 0 ? (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${albumDetailItemMinWidth}px, 1fr))` }}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="polaroid">
                    <div className="mb-4 aspect-square rounded-sm bg-outline/10" />
                  </div>
                </div>
              ))}
            </div>
          ) : error && loadedItems.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4">
              <p className="text-error">{error}</p>
              <button onClick={handleReloadFirstPage} className="rounded-lg bg-primary-container px-4 py-2 text-on-primary-container">
                重试
              </button>
            </div>
          ) : (
            <>
              <motion.div
                initial="hidden"
                animate="show"
                variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.03 } } }}
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${albumDetailItemMinWidth}px, 1fr))` }}
              >
                {renderedItems.map((asset, index) => (
                  <motion.div
                    key={asset.id}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
                    }}
                    className="group relative cursor-pointer"
                  >
                    <div onClick={() => setSelectedImageIndex(index)}>
                      <Polaroid src={asset.thumbnailUrl} caption="" rotation={(index % 5 - 2) * 1} className="w-full" />
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              {(hasMore || hasMoreToRender) && <div ref={loadMoreTriggerRef} className="h-2 w-full" />}
              {isLoadingMore && (
                <div className="mt-8 flex justify-center text-outline">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
            </>
          )}
        </section>

        <footer className="z-10 hidden h-20 items-center justify-between border-t-2 border-outline/5 bg-surface/50 px-12 backdrop-blur-sm md:flex">
          <div className="flex items-center gap-3 text-outline-variant/80">
            <Paperclip className="h-4 w-4" />
            <code className="text-xs font-medium tracking-tight">/Volume1/pb1/{albumId}/moments/</code>
          </div>
        </footer>
      </main>

      {selectedImageIndex !== null && (
        <ViewerGallery
          items={loadedItems}
          isOpen
          initialIndex={selectedImageIndex}
          onClose={() => setSelectedImageIndex(null)}
          onRequestNextAlbum={onRequestNextAlbum}
          onRequestMoreItems={handleLoadMoreForViewer}
          hasMoreItems={hasMore}
          isLoadingMoreItems={isLoadingMore}
          defaultQualityPreset={systemConfig?.defaultImageQualityPreset ?? 'original'}
          preloadBefore={preloadBefore}
          preloadAfter={preloadAfter}
        />
      )}

      {isShareDialogOpen && (
        <AlbumShareDialog
          albumId={albumId}
          albumName={assets?.album?.name || albumId}
          onClose={() => setIsShareDialogOpen(false)}
        />
      )}

      <nav className="fixed bottom-0 z-50 flex w-full items-center justify-between rounded-t-[2rem] border-t border-white/60 bg-white/85 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.1rem)] shadow-[0_-12px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl md:hidden">
        <div className="text-left text-[11px] leading-4 text-outline/80">
          <p>共 {assets?.album?.assetCount ?? loadedItems.length} 张图片</p>
          <p>已加载 {loadedItems.length} 张</p>
        </div>
        <button onClick={onBack} className="flex min-h-12 min-w-16 flex-col items-center justify-center text-outline transition-opacity hover:opacity-80">
          <ArrowLeft className="h-6 w-6" />
          <span className="text-[10px] tracking-widest">返回相册</span>
        </button>
      </nav>
    </div>
  );
};
