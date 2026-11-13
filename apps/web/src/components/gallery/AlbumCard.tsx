import { useCurrentUser } from '../../app/current-user';
import { Images, Share2, Star } from 'lucide-react';
import type { AlbumListItemDTO } from '../../types/api';
import { CoverCard } from './CoverCard';

type AlbumCardProps = {
  album: AlbumListItemDTO;
  index: number;
  isMobile: boolean;
  onNavigateToAlbum: (albumId: string) => void;
  onFavoriteToggle?: (album: AlbumListItemDTO) => void;
  onShare?: (album: AlbumListItemDTO) => void;
};

export const formatAlbumDate = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

export function AlbumCard({ album, onNavigateToAlbum, onFavoriteToggle, onShare }: AlbumCardProps) {
  const { isAdmin } = useCurrentUser();
  const date = formatAlbumDate(album.updatedAt);

  return (
    <CoverCard
      title={album.name}
      meta={`${album.assetCount} 张${date ? ` · ${date}` : ''}`}
      coverUrl={album.coverUrl}
      placeholderIcon={<Images className="h-12 w-12" />}
      tag={album.sourceType === 'zip' ? '压缩包' : '文件夹'}
      onOpen={() => onNavigateToAlbum(album.id)}
      notice={album.scanStatus === 'error'
        ? <p role="status" className="mb-2 text-xs text-error">扫描部分失败，已保留原图片，请检查媒体目录后重试</p>
        : undefined}
      badge={album.isFavorite ? <Star className="h-4 w-4 fill-current text-favorite drop-shadow" aria-label="已收藏" /> : undefined}
      actions={isAdmin ? (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onShare?.(album);
            }}
            className="flex h-8 w-8 items-center justify-center mp-photo-btn rounded-full text-on-surface-variant transition-colors hover:text-primary"
            title="分享图集"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFavoriteToggle?.(album);
            }}
            className={`flex h-8 w-8 items-center justify-center mp-photo-btn rounded-full transition-colors ${album.isFavorite ? 'text-favorite' : 'text-on-surface-variant hover:text-favorite'}`}
            title={album.isFavorite ? '取消收藏' : '收藏图集'}
            aria-pressed={album.isFavorite}
          >
            <Star className={`h-4 w-4 ${album.isFavorite ? 'fill-current' : ''}`} />
          </button>
        </>
      ) : undefined}
    />
  );
}
