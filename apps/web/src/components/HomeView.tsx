import { useCallback, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { m } from 'motion/react';
import { api } from '../lib/api';
import { useCurrentUser } from '../app/current-user';
import { useAppNavigation } from '../app/app-navigation';
import type { AlbumListItemDTO, AlbumsListDTO, SmartAlbumListItemDTO, SmartAlbumsListDTO } from '../types/api';
import { ContinueReading } from './ContinueReading';
import { AlbumCard } from './gallery/AlbumCard';
import { SmartAlbumCard } from './gallery/SmartAlbumCard';
import { galleryGridContainerVariants } from './gallery/gallery-card-motion';

type HomeData = {
  recent: AlbumListItemDTO[];
  total: number | null;
  favorites: AlbumListItemDTO[];
  smart: SmartAlbumListItemDTO[];
  loaded: boolean;
};

const ROW_SIZE = 10;
const EMPTY: HomeData = { recent: [], total: null, favorites: [], smart: [], loaded: false };

export const resolveGreeting = (date: Date): string => {
  const hour = date.getHours();
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
};

/** 首页数据：复用相册与智能相册列表接口，不需要新接口。 */
export const useHomeData = (refreshKey: number) => {
  const [data, setData] = useState<HomeData>(EMPTY);
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const settle = <T,>(promise: Promise<T>) => promise.catch(() => null);
    void Promise.all([
      settle(api.get<AlbumsListDTO>('/albums', { page: 1, pageSize: ROW_SIZE, sortBy: 'updatedAt', sortOrder: 'desc' }, options)),
      settle(api.get<AlbumsListDTO>('/albums', { page: 1, pageSize: ROW_SIZE, sortBy: 'updatedAt', sortOrder: 'desc', favoriteOnly: 'true' }, options)),
      settle(api.get<SmartAlbumsListDTO>('/smart-albums', { page: 1, pageSize: ROW_SIZE, sortBy: 'albumCount', sortOrder: 'desc' }, options)),
    ]).then(([recent, favorites, smart]) => {
      if (controller.signal.aborted) return;
      setData({
        recent: recent?.items ?? [],
        total: recent?.pagination.total ?? null,
        favorites: favorites?.items ?? [],
        smart: smart?.items ?? [],
        loaded: true,
      });
    });
    return () => controller.abort();
  }, [refreshKey]);
  return data;
};

const Row = ({ title, actionLabel, onAction, children }: { title: string; actionLabel: string; onAction: () => void; children: React.ReactNode }) => (
  <section className="mb-9" aria-label={title}>
    <div className="mb-3.5 flex items-baseline justify-between">
      <h2 className="mp-title text-[17px]">{title}</h2>
      <button type="button" onClick={onAction} className="flex items-center gap-1 text-[13px] text-primary hover:underline">
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
    <m.div
      variants={galleryGridContainerVariants}
      initial="hidden"
      animate="show"
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 168px), 1fr))' }}
    >
      {children}
    </m.div>
  </section>
);

type HomeViewProps = {
  isMobile: boolean;
  onOpenAlbum: (albumId: string) => void;
  onOpenSmartAlbum: (smartAlbumId: string) => void;
  onAlbumFavoriteToggle?: (album: AlbumListItemDTO) => Promise<void> | void;
  onShareAlbum?: (album: AlbumListItemDTO) => void;
};

/** 首页：问候 + 继续阅读 + 最近更新 + 收藏 + 智能相册；没有内容的行整行隐藏。 */
export function HomeView({ isMobile, onOpenAlbum, onOpenSmartAlbum, onAlbumFavoriteToggle, onShareAlbum }: HomeViewProps) {
  const nav = useAppNavigation();
  const { user } = useCurrentUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const data = useHomeData(refreshKey);
  const rowLimit = isMobile ? 4 : ROW_SIZE;
  const toggleFavorite = useCallback(async (album: AlbumListItemDTO) => {
    await onAlbumFavoriteToggle?.(album);
    setRefreshKey((value) => value + 1);
  }, [onAlbumFavoriteToggle]);

  const greeting = resolveGreeting(new Date());
  const statParts = [
    data.total !== null ? `共 ${data.total} 个相册` : null,
    nav.libraryRoots.length ? `${nav.libraryRoots.length} 个图库` : null,
  ].filter(Boolean);

  return (
    <div>
      <header className="mb-8 pt-1 md:mb-10">
        <p className="mp-eyebrow">Moment · 瞬间图库</p>
        <h1 className="mp-title mt-2.5 text-[26px] leading-tight md:text-[34px]">
          {greeting}{user?.username ? `，${user.username}` : ''}
        </h1>
        <hr className="mp-rule mt-3.5" />
        {statParts.length > 0 && <p className="mt-3.5 text-sm tracking-[0.04em] text-on-surface-variant">{statParts.join(' · ')}</p>}
      </header>

      <ContinueReading onOpen={onOpenAlbum} />

      {data.recent.length > 0 && (
        <Row title="最近更新" actionLabel="全部相册" onAction={nav.onAllAlbums}>
          {data.recent.slice(0, rowLimit).map((album, index) => (
            <AlbumCard
              key={album.id}
              album={album}
              index={index}
              isMobile={isMobile}
              onNavigateToAlbum={onOpenAlbum}
              onFavoriteToggle={toggleFavorite}
              onShare={onShareAlbum}
            />
          ))}
        </Row>
      )}

      {data.favorites.length > 0 && (
        <Row title="收藏" actionLabel="全部收藏" onAction={nav.onFavorites}>
          {data.favorites.slice(0, rowLimit).map((album, index) => (
            <AlbumCard
              key={album.id}
              album={album}
              index={index}
              isMobile={isMobile}
              onNavigateToAlbum={onOpenAlbum}
              onFavoriteToggle={toggleFavorite}
              onShare={onShareAlbum}
            />
          ))}
        </Row>
      )}

      {data.smart.length > 0 && (
        <Row title="智能相册" actionLabel="全部智能相册" onAction={nav.onSmart}>
          {data.smart.slice(0, rowLimit).map((album, index) => (
            <SmartAlbumCard key={album.id} album={album} index={index} isMobile={isMobile} onNavigateToAlbum={onOpenSmartAlbum} />
          ))}
        </Row>
      )}

      {data.loaded && data.recent.length === 0 && (
        <div className="mp-glass-panel rounded-[18px] px-6 py-14 text-center">
          <p className="mp-title text-lg">这里还是一片空白</p>
          <p className="mt-2 text-sm text-on-surface-variant">到“设置 → 图库”添加媒体目录并扫描，相册就会出现在这里。</p>
        </div>
      )}
    </div>
  );
}
