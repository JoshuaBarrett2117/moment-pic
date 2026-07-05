import { type FC, useCallback, useMemo, useRef, useState } from 'react';
import { Loader2, LockKeyhole, Share2 } from 'lucide-react';
import { authenticateAlbumShare, fetchSharedAlbumAssets } from '../hooks';
import type { AssetListItemDTO, SharedAlbumAuthDTO } from '../types/api';
import { Polaroid } from './Polaroid';
import { ViewerGallery } from './ViewerGallery';

const PAGE_SIZE = 48;

type SharedAlbumScreenProps = {
  token: string;
};

export const SharedAlbumScreen: FC<SharedAlbumScreenProps> = ({ token }) => {
  const [password, setPassword] = useState('');
  const [auth, setAuth] = useState<SharedAlbumAuthDTO | null>(null);
  const [items, setItems] = useState<AssetListItemDTO[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadedItemsRef = useRef<AssetListItemDTO[]>([]);

  const hasMore = items.length < totalItems;
  const expiresLabel = useMemo(() => {
    if (!auth?.expiresAt) {
      return '';
    }

    return new Date(auth.expiresAt).toLocaleString('zh-CN');
  }, [auth?.expiresAt]);

  const loadPage = useCallback(async (page: number, append: boolean, accessTokenOverride?: string): Promise<boolean> => {
    if (append) {
      setIsLoadingMore(true);
    }

    const accessToken = accessTokenOverride ?? auth?.accessToken;
    if (!accessToken) {
      return false;
    }

    const result = await fetchSharedAlbumAssets(token, accessToken, { page, pageSize: PAGE_SIZE });
    if (!result) {
      setError('分享链接已失效或不存在');
      setIsLoadingMore(false);
      return false;
    }

    setCurrentPage(result.pagination.page);
    setTotalItems(result.pagination.total);
    setItems((prev) => {
      if (!append) {
        loadedItemsRef.current = result.items;
        return result.items;
      }

      const prevIds = new Set(prev.map((item) => item.id));
      const nextItems = result.items.filter((item) => !prevIds.has(item.id));
      const merged = [...prev, ...nextItems];
      loadedItemsRef.current = merged;
      return merged;
    });
    setIsLoadingMore(false);
    return result.items.length > 0;
  }, [auth?.accessToken, token]);

  const handleAuthenticate = async () => {
    setError('');
    if (!password.trim()) {
      setError('请输入分享密码');
      return;
    }

    setIsAuthenticating(true);
    const result = await authenticateAlbumShare(token, password);
    setIsAuthenticating(false);
    if (!result) {
      setError('密码不正确或分享链接已失效');
      return;
    }

    setAuth(result);
    await loadPage(1, false, result.accessToken);
  };

  const handleLoadMoreForViewer = useCallback(async (): Promise<boolean> => {
    if (isLoadingMore || loadedItemsRef.current.length >= totalItems) {
      return false;
    }

    return loadPage(currentPage + 1, true);
  }, [currentPage, isLoadingMore, loadPage, totalItems]);

  if (!auth) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-surface px-4">
        <div className="w-full max-w-sm rounded-lg border border-outline/10 bg-surface-container-low p-6 shadow-xl">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-headline text-xl font-bold text-on-surface">查看分享图集</h1>
              <p className="mt-1 text-xs text-outline">请输入分享密码</p>
            </div>
          </div>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleAuthenticate();
              }
            }}
            type="password"
            className="mb-3 w-full rounded-md border border-outline/20 bg-surface px-3 py-2 text-sm text-on-surface outline-none transition-colors focus:border-primary"
          />
          {error && <p className="mb-3 text-sm text-error">{error}</p>}
          <button
            type="button"
            onClick={() => void handleAuthenticate()}
            disabled={isAuthenticating}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isAuthenticating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            进入图集
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-surface">
      <header className="border-b border-outline/10 bg-surface/92 px-5 py-4 backdrop-blur md:px-10">
        <h1 className="truncate font-headline text-2xl font-bold text-on-surface">{auth.name}</h1>
        <p className="mt-1 text-xs text-outline">分享有效期至 {expiresLabel}</p>
      </header>
      <main className="custom-scrollbar flex-1 overflow-y-auto px-4 py-5 md:px-10">
        {error ? (
          <div className="flex h-64 items-center justify-center text-error">{error}</div>
        ) : items.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-outline">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            正在加载图集...
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {items.map((asset, index) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setSelectedImageIndex(index)}
                className="cursor-pointer text-left"
              >
                <Polaroid src={asset.thumbnailUrl} caption="" rotation={(index % 5 - 2) * 1} className="w-full" />
              </button>
            ))}
          </div>
        )}
      </main>

      {selectedImageIndex !== null && (
        <ViewerGallery
          items={items}
          isOpen
          initialIndex={selectedImageIndex}
          onClose={() => setSelectedImageIndex(null)}
          onRequestMoreItems={handleLoadMoreForViewer}
          hasMoreItems={hasMore}
          isLoadingMoreItems={isLoadingMore}
          defaultQualityPreset="balanced"
          preloadBefore={1}
          preloadAfter={2}
        />
      )}
    </div>
  );
};
