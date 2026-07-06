import { type FC, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Copy, Loader2, Share2, Trash2 } from 'lucide-react';
import { deleteManagedAlbumShare, fetchManagedAlbumShares } from '../hooks';
import type { LibraryRootDTO, ManagedAlbumShareDTO } from '../types/api';
import { Sidebar } from './Sidebar';
import { ThrottledImage } from './ThrottledImage';

type ShareManagementScreenProps = {
  activeTab: 'gallery' | 'settings';
  albumCount: number;
  libraryRoots: LibraryRootDTO[];
  currentLibraryRootId: string;
  isAnyScanning: boolean;
  isScanning: (libraryRootId: string) => boolean;
  onBack: () => void;
  onNavigate: (tab: 'gallery' | 'settings') => void;
  onLibraryRootChange: (id: string) => void;
  onScanAll: () => void;
  onScanOne: (libraryRootId: string) => void;
  onRecentClick: () => void;
  onSmartAlbumsClick: () => void;
  onDirectoryAlbumsClick: () => void;
  onFavoritesClick: () => void;
  onShareManagementClick: () => void;
};

export const ShareManagementScreen: FC<ShareManagementScreenProps> = ({
  activeTab,
  albumCount,
  libraryRoots,
  currentLibraryRootId,
  isAnyScanning,
  isScanning,
  onBack,
  onNavigate,
  onLibraryRootChange,
  onScanAll,
  onScanOne,
  onRecentClick,
  onSmartAlbumsClick,
  onDirectoryAlbumsClick,
  onFavoritesClick,
  onShareManagementClick,
}) => {
  const [items, setItems] = useState<ManagedAlbumShareDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const loadShares = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const result = await fetchManagedAlbumShares();
    setIsLoading(false);
    if (!result) {
      setError('加载分享列表失败');
      return;
    }
    setItems(result.items);
  }, []);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  const handleCopy = async (shareUrl: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      setError('复制失败，请手动复制链接');
    }
  };

  const handleDelete = async (shareId: string) => {
    const success = await deleteManagedAlbumShare(shareId);
    if (!success) {
      setError('删除分享失败');
      return;
    }
    await loadShares();
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onNavigate={onNavigate}
        libraryRoots={libraryRoots}
        currentLibraryRootId={currentLibraryRootId}
        onLibraryRootChange={onLibraryRootChange}
        onScanAll={onScanAll}
        onScanOne={onScanOne}
        isAnyScanning={isAnyScanning}
        isScanning={isScanning}
        albumCount={albumCount}
        onRecentClick={onRecentClick}
        isRecentActive={false}
        onSmartAlbumsClick={onSmartAlbumsClick}
        isSmartAlbumsActive={false}
        onDirectoryAlbumsClick={onDirectoryAlbumsClick}
        isDirectoryAlbumsActive={false}
        onFavoritesClick={onFavoritesClick}
        isFavoritesActive={false}
        onShareManagementClick={onShareManagementClick}
        isShareManagementActive
      />

      <main className="custom-scrollbar relative h-full flex-1 overflow-y-auto bg-surface px-4 pt-12 pb-20 md:ml-80 md:px-12 md:pt-16">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-3 flex items-center gap-1 rounded-full bg-surface-container-high px-3 py-1.5 text-sm text-outline transition-colors hover:text-on-surface"
            >
              <ArrowLeft className="h-4 w-4" />
              返回
            </button>
            <h1 className="font-script text-4xl font-bold tracking-tight text-on-surface md:text-6xl">分享管理</h1>
            <p className="mt-2 text-sm text-outline md:text-base">管理仍在有效期内的图集分享链接</p>
          </div>
          {isLoading && <Loader2 className="h-6 w-6 animate-spin text-outline" />}
        </header>

        {error && <div className="mb-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}

        {items.length === 0 && !isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-outline/20 text-outline">
            <Share2 className="mb-3 h-8 w-8" />
            <p className="font-semibold">还没有活跃分享</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <article key={item.id} className="grid gap-4 rounded-lg border border-outline/10 bg-surface-container-low p-4 shadow-sm md:grid-cols-[96px_1fr_auto] md:items-center">
                <div className="h-24 overflow-hidden rounded-md bg-surface-container-high">
                  {item.albumCoverUrl ? (
                    <ThrottledImage src={item.albumCoverUrl} alt={item.albumName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-outline/40">
                      <Share2 className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-headline text-xl font-bold text-on-surface">{item.albumName}</h2>
                  <p className="mt-1 text-sm text-outline">{item.albumAssetCount} 张图片</p>
                  <p className="mt-2 break-all text-xs text-outline/80">{item.shareUrl}</p>
                  <p className="mt-2 text-xs text-outline/70">
                    有效期至 {new Date(item.expiresAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div className="flex gap-2 md:flex-col">
                  <button
                    type="button"
                    onClick={() => void handleCopy(item.shareUrl)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container transition-all hover:brightness-95"
                    title="复制链接"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-error/10 text-error transition-all hover:bg-error/20"
                    title="删除分享"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
