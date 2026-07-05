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
  const colorScheme = galleryAlbumTagColors[album.sourceType] || galleryAlbumTagColors.folder;

  return (
    <motion.div
      variants={galleryCardItemVariants}
      whileHover={getGalleryCardHover({ index, isMobile })}
      className="group cursor-pointer"
    >
      <div className="relative rounded-xl bg-surface-container-highest p-4 shadow-lg transition-all duration-300 hover:shadow-xl">
        <div onClick={() => onNavigateToAlbum(album.id)} className="pointer-events-auto">
          <div
            className={`absolute -top-3 z-10 rounded-full border border-black/5 px-4 py-1 text-xs font-bold shadow-sm ${
              getGalleryCardTagPlacement(index)
            } ${colorScheme.bg} ${colorScheme.text}`}
          >
            {album.sourceType === 'folder' ? '文件夹' : '压缩包'}
          </div>
          <div className="grid aspect-square grid-cols-3 gap-1.5 overflow-hidden rounded-xl">
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
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFavoriteToggle?.(album);
            }}
            className={`absolute right-6 bottom-24 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 shadow-md backdrop-blur transition-all hover:scale-105 ${
              album.isFavorite ? 'text-amber-500' : 'text-outline'
            }`}
            title={album.isFavorite ? '取消收藏' : '收藏图集'}
          >
            <Star className={`h-5 w-5 ${album.isFavorite ? 'fill-amber-400' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onShare?.(album);
            }}
            className="absolute left-6 bottom-24 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-outline opacity-100 shadow-md backdrop-blur transition-all hover:scale-105 hover:text-primary md:opacity-0 md:group-hover:opacity-100"
            title="分享图集"
          >
            <Share2 className="h-5 w-5" />
          </button>
          <div className="mt-4 px-2 pb-2">
            <h3 className="mb-1 truncate font-headline text-lg font-bold leading-tight text-on-surface" title={album.name}>
              {album.name}
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wider text-outline">{album.assetCount} 张</span>
              <ArrowRight className="h-4 w-4 text-outline/30 transition-all group-hover:translate-x-1 group-hover:text-primary" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
