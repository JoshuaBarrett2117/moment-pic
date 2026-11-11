import { useCurrentUser } from '../../app/current-user';
import { motion } from 'motion/react';
import { ArrowRight, Plus, Share2, Star } from 'lucide-react';
import { ThrottledImage } from '../ThrottledImage';
import type { AlbumListItemDTO } from '../../types/api';
import { galleryAlbumTagColors } from './gallery-album-types';
import { galleryCardItemVariants, getGalleryCardHover, getGalleryCardTagPlacement } from './gallery-card-motion';

type AlbumCardProps = {
  album: AlbumListItemDTO;
  index: number;
  isMobile: boolean;
  onNavigateToAlbum: (albumId: string) => void;
  onFavoriteToggle?: (album: AlbumListItemDTO) => void;
  onShare?: (album: AlbumListItemDTO) => void;
};

export function AlbumCard({
  album,
  index,
  isMobile,
  onNavigateToAlbum,
  onFavoriteToggle,
  onShare,
}: AlbumCardProps) {
  const { isAdmin } = useCurrentUser();
  const colorScheme = galleryAlbumTagColors[album.sourceType] || galleryAlbumTagColors.folder;

  return (
    <motion.div
      variants={galleryCardItemVariants}
      whileHover={getGalleryCardHover({ index, isMobile })}
      className="group cursor-pointer"
    >
      <div className="relative mp-card p-3">
        {album.scanStatus === 'error' && <p role="status" className="mb-2 text-sm text-error">扫描部分失败，已保留原图片，请检查媒体目录后重试</p>}
        <div onClick={() => onNavigateToAlbum(album.id)} className="pointer-events-auto">
          <div
            className={`absolute -top-3 z-10 rounded-full border border-outline-variant px-3 py-0.5 text-xs font-semibold backdrop-blur-md ${
              getGalleryCardTagPlacement()
            } ${colorScheme.bg} ${colorScheme.text}`}
          >
            {album.sourceType === 'folder' ? '文件夹' : '压缩包'}
          </div>
          <div className="grid aspect-square grid-cols-3 gap-1.5 overflow-hidden rounded-[12px]">
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
          {isAdmin && (
          <div className="pointer-events-none absolute inset-x-6 bottom-24 z-20 flex items-center justify-between opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShare?.(album);
              }}
              className="flex h-10 w-10 items-center justify-center mp-glass-overlay rounded-full text-on-surface-variant transition-all hover:scale-105 hover:text-primary"
              title="分享图集"
            >
              <Share2 className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onFavoriteToggle?.(album);
              }}
              className={`flex h-10 w-10 items-center justify-center mp-glass-overlay rounded-full transition-all hover:scale-105 ${
                album.isFavorite ? 'text-tertiary' : 'text-outline'
              }`}
              title={album.isFavorite ? '取消收藏' : '收藏图集'}
            >
              <Star className={`h-5 w-5 ${album.isFavorite ? 'fill-tertiary' : ''}`} />
            </button>
          </div>
          )}
          <div className="mt-3 px-1 pb-1">
            <h3 className="mb-1 truncate font-headline text-base font-semibold leading-tight text-on-surface" title={album.name}>
              {album.name}
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-sm tabular-nums text-outline">{album.assetCount} 张</span>
              <ArrowRight className="h-4 w-4 text-outline/30 transition-all group-hover:translate-x-1 group-hover:text-primary" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
