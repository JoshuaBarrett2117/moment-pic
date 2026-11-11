import { type FC, useEffect, useState, useCallback, useRef } from 'react';
import { useCurrentUser } from '../app/current-user';
import { ArrowLeft, Camera, ImageOff, LayoutGrid, Loader2, Play, RefreshCw, Rows3, Share2, Star } from 'lucide-react';
import { ThrottledImage } from './ThrottledImage';
import { getAssetThumbnailPresentation } from '../lib/asset-thumbnail';
import { AlbumShareDialog } from './AlbumShareDialog';
import { AlbumPathTrail } from './AlbumPathTrail';
import { useToast } from './Toast';
import { useAlbumReader } from '../hooks/use-album-reader';
import { ViewerGallery } from './ViewerGallery';
import { useAlbumAssets, rescanAlbum, setAlbumFavorite, useMobile, useSystemConfig, useWideMobile } from '../hooks';
import type { AssetListItemDTO } from '../types/api';

interface AlbumDetailScreenProps {
  mode?: 'album' | 'share';
  albumId: string;
  onBack: () => void;
  onRequestNextAlbum?: () => void;
  /** 侧栏目录里点了同级图集：直接跳到对应图集 */
}

const PAGE_SIZE = 24;
const RENDER_CHUNK_SIZE = 96;
const DEFAULT_PRELOAD_BEFORE = 2;
const DEFAULT_PRELOAD_AFTER = 3;
const DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_MOBILE = 160;
const DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_DESKTOP = 300;

export const AlbumDetailScreen: FC<AlbumDetailScreenProps> = ({ albumId, onBack, onRequestNextAlbum, mode = "album" }) => {
  const { isAdmin } = useCurrentUser();
  const isMobile = useMobile();
  const isWideMobile = useWideMobile();
  const { assets, isLoading, error, fetchAssets } = useAlbumAssets();
  const { systemConfig, fetchSystemConfig } = useSystemConfig();
  const { toast } = useToast();
  const reader = useAlbumReader(albumId, mode === "album");
  const [loadedItems, setLoadedItems] = useState<AssetListItemDTO[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRescanningAlbum, setIsRescanningAlbum] = useState(false);
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [visibleRenderCount, setVisibleRenderCount] = useState(RENDER_CHUNK_SIZE);
  const [layout, setLayout] = useDetailLayout();
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

  const album = assets?.album;
  const bannerCover = loadedItems[0] ? getAssetThumbnailPresentation(loadedItems[0]).src : null;
  const metaParts = [
    album ? `${album.assetCount} 张照片` : null,
    album?.updatedAt ? `更新于 ${new Date(album.updatedAt).toLocaleDateString('zh-CN')}` : null,
    reader.progress ? `读到第 ${reader.progress.assetIndex + 1} 张` : null,
  ].filter(Boolean);
  const startReading = () => {
    if (reader.progress) {
      void reader.open(reader.progress.assetId, reader.progress.assetIndex);
      return;
    }
    const first = loadedItems[0];
    if (first) void reader.open(first.id, first.sortIndex - 1);
  };
  const thumbSize = isMobile && !isWideMobile ? Math.round(albumDetailItemMinWidth * 0.75) : Math.round(albumDetailItemMinWidth * 0.8);
  const rowHeight = isMobile && !isWideMobile ? 150 : 210;
  const iconButton = 'flex h-10 items-center justify-center gap-2 rounded-[10px] border border-outline-variant mp-glass-panel px-3 text-sm text-on-surface transition-colors hover:border-outline disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <section
        ref={scrollContainerRef}
        className="custom-scrollbar h-full overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-6 md:pt-5"
      >
        <header className="relative overflow-hidden rounded-[18px] border border-outline-variant">
          <div
            aria-hidden="true"
            className="absolute -inset-8 bg-cover bg-center"
            style={{ backgroundImage: bannerCover ? `url("${bannerCover}")` : undefined, filter: 'var(--mp-banner-filter, blur(28px) brightness(0.6) saturate(1.2))' }}
          />
          <div aria-hidden="true" className="absolute inset-0" style={{ background: 'var(--mp-banner-overlay, linear-gradient(180deg, rgba(7,7,8,0.15), rgba(7,7,8,0.78)))' }} />
          <div className="relative flex flex-col gap-4 p-4 md:flex-row md:items-end md:gap-6 md:p-7">
            <button
              type="button"
              onClick={onBack}
              className="absolute left-3 top-3 flex items-center gap-1 rounded-full mp-glass-panel px-3 py-1.5 text-sm text-on-surface-variant transition-colors hover:text-on-surface md:left-5 md:top-5"
            >
              <ArrowLeft className="h-4 w-4" />
              返回
            </button>
            <div className="mt-11 flex items-end gap-4 md:mt-10 md:gap-6">
              <div className="mp-cover-card h-28 w-[5.6rem] shrink-0 md:h-44 md:w-36">
                {bannerCover ? (
                  <img src={bannerCover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-surface-container-high text-outline">
                    <Camera className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="min-w-0 pb-1">
                {mode === 'album' && album?.libraryRootId && (
                  <AlbumPathTrail
                    variant="inline"
                    className="mb-2"
                    rootName={album.libraryRootName}
                    relativePath={album.parentRelativePath ?? ''}
                    albumName={album.name}
                  />
                )}
                <p className="mp-eyebrow">Album</p>
                <h1 className="mp-title mt-1.5 line-clamp-2 text-[22px] leading-tight md:text-[32px]">{album?.name || '正在加载…'}</h1>
                {metaParts.length > 0 && <p className="mt-2 text-[13px] tabular-nums text-on-surface-variant">{metaParts.join(' · ')}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:ml-auto md:justify-end">
              <button
                type="button"
                onClick={startReading}
                disabled={!loadedItems.length && !reader.progress}
                className="flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" />
                {reader.progress ? '继续阅读' : '开始浏览'}
              </button>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleFavoriteToggle()}
                    disabled={isUpdatingFavorite}
                    className={iconButton}
                    aria-pressed={album?.isFavorite ?? false}
                    title={album?.isFavorite ? '取消收藏' : '收藏图集'}
                  >
                    {isUpdatingFavorite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className={`h-4 w-4 ${album?.isFavorite ? 'fill-current text-favorite' : ''}`} />}
                    <span className={album?.isFavorite ? 'text-favorite' : ''}>{album?.isFavorite ? '已收藏' : '收藏'}</span>
                  </button>
                  <button type="button" onClick={() => setIsShareDialogOpen(true)} className={iconButton} title="分享图集">
                    <Share2 className="h-4 w-4" />
                    <span className="hidden sm:inline">分享</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRescanAlbum()}
                    disabled={isRescanningAlbum}
                    className={iconButton}
                    title="重新扫描当前图集"
                    aria-label="重新扫描当前图集"
                  >
                    {isRescanningAlbum ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="sticky top-0 z-20 -mx-1 mt-4 px-1 pt-1">
          <div className="mp-glass-panel flex items-center gap-2 rounded-[14px] p-1.5">
            <div role="radiogroup" aria-label="排列方式" className="flex items-center gap-1">
              {(['grid', 'justified'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={layout === value}
                  onClick={() => setLayout(value)}
                  className={`flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] transition-colors ${layout === value ? 'bg-primary-container text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  {value === 'grid' ? <LayoutGrid className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
                  {value === 'grid' ? '网格' : '等高拼图'}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <span className="px-2 text-xs tabular-nums text-on-surface-variant">
              {album ? `已加载 ${loadedItems.length} / ${album.assetCount}` : ''}
            </span>
          </div>
        </div>

        {reader.loading && !reader.session && <p role="status" className="mt-3 text-sm text-on-surface-variant">正在定位阅读位置…</p>}
        {reader.error && <p role="status" className="mt-3 text-sm text-error">{reader.error}</p>}

        <div className="mt-4">
          {isLoading && loadedItems.length === 0 ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${thumbSize}px), 1fr))` }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="mp-cover-card animate-pulse">
                  <div className="aspect-square bg-surface-container-high" />
                </div>
              ))}
            </div>
          ) : error && loadedItems.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4">
              <p className="text-error">{error}</p>
              <button onClick={handleReloadFirstPage} className="rounded-[10px] bg-primary px-4 py-2 font-semibold text-on-primary">
                重试
              </button>
            </div>
          ) : (
            <>
              {layout === 'grid' ? (
                <div className="grid gap-2.5 md:gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${thumbSize}px), 1fr))` }}>
                  {renderedItems.map((asset) => (
                    <AssetTile key={asset.id} asset={asset} onOpen={() => void reader.open(asset.id, asset.sortIndex - 1)} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 md:gap-2.5 after:block after:grow-[999]">
                  {renderedItems.map((asset) => (
                    <AssetTile key={asset.id} asset={asset} justifiedRowHeight={rowHeight} onOpen={() => void reader.open(asset.id, asset.sortIndex - 1)} />
                  ))}
                </div>
              )}

              {(hasMore || hasMoreToRender) && <div ref={loadMoreTriggerRef} className="h-2 w-full" />}
              {isLoadingMore && (
                <div className="mt-8 flex justify-center text-outline">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {reader.session && (
        <ViewerGallery
          key={reader.session.key}
          items={reader.session.items}
          isOpen
          initialIndex={reader.session.initialIndex}
          onClose={reader.close}
          onRequestNextAlbum={onRequestNextAlbum}
          onRequestMoreItems={reader.loadNext}
          onRequestPreviousItems={reader.loadPrevious}
          hasPreviousItems={reader.hasPrevious}
          totalItems={reader.session.total}
          onAssetChange={mode === "album" ? reader.savePosition : undefined}
          hasMoreItems={reader.hasNext}
          isLoadingMoreItems={reader.loading}
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

    </div>
  );
};

type DetailLayout = 'grid' | 'justified';
const DETAIL_LAYOUT_KEY = 'moment-pic:detail-layout';

/** 相册详情排列方式：网格（正方形裁切）/ 等高拼图（保留原图比例），保存在当前浏览器。 */
function useDetailLayout(): [DetailLayout, (value: DetailLayout) => void] {
  const [layout, setLayoutState] = useState<DetailLayout>(() => {
    try {
      return window.localStorage.getItem(DETAIL_LAYOUT_KEY) === 'justified' ? 'justified' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const setLayout = useCallback((value: DetailLayout) => {
    setLayoutState(value);
    try {
      window.localStorage.setItem(DETAIL_LAYOUT_KEY, value);
    } catch {
      // ignore
    }
  }, []);
  return [layout, setLayout];
}

function AssetTile({ asset, onOpen, justifiedRowHeight }: { asset: AssetListItemDTO; onOpen: () => void; justifiedRowHeight?: number }) {
  const [failed, setFailed] = useState(false);
  const presentation = getAssetThumbnailPresentation(asset);
  const ratio = Math.min(3, Math.max(0.33, presentation.aspectRatio));
  const style = justifiedRowHeight
    ? { flexGrow: ratio, flexBasis: `${Math.round(justifiedRowHeight * ratio)}px`, aspectRatio: String(ratio) }
    : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      style={style}
      aria-label={`查看 ${asset.name}`}
      className={`mp-cover-card group ${justifiedRowHeight ? 'max-h-[60vh]' : 'aspect-square'}`}
    >
      {failed ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-container-high text-outline">
          <ImageOff className="h-6 w-6" />
          <span className="text-xs">预览不可用</span>
        </span>
      ) : (
        <ThrottledImage
          src={presentation.src}
          alt={asset.name}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}
