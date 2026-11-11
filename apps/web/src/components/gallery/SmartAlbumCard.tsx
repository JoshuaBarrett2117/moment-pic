import { motion } from 'motion/react';
import { ArrowRight, Layers3 } from 'lucide-react';
import { ThrottledImage } from '../ThrottledImage';
import type { SmartAlbumListItemDTO } from '../../types/api';
import { galleryCardItemVariants, getGalleryCardHover } from './gallery-card-motion';

type SmartAlbumCardProps = {
  album: SmartAlbumListItemDTO;
  index: number;
  isMobile: boolean;
  onNavigateToAlbum: (albumId: string) => void;
};

export function SmartAlbumCard({
  album,
  index,
  isMobile,
  onNavigateToAlbum,
}: SmartAlbumCardProps) {
  return (
    <motion.div
      variants={galleryCardItemVariants}
      whileHover={getGalleryCardHover({ index, isMobile })}
      className="group cursor-pointer"
    >
      <button
        onClick={() => onNavigateToAlbum(album.id)}
        className="relative w-full mp-card p-3 text-left"
      >
        <div className="absolute right-3 -top-3 z-10 rounded-full border border-outline-variant bg-primary-container px-3 py-0.5 text-xs font-semibold text-primary backdrop-blur-md">
          {album.albumCount} 套图集
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
            <div className="col-span-3 flex h-full items-center justify-center bg-surface-container-high">
              <Layers3 className="h-12 w-12 text-outline/20" />
            </div>
          )}
        </div>
        <div className="mt-3 px-1 pb-1">
          <h3 className="mb-1 truncate font-headline text-base font-semibold leading-tight text-on-surface" title={album.name}>
            {album.name}
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-sm tabular-nums text-outline">{album.assetCount} 张</span>
            <ArrowRight className="h-4 w-4 text-outline/30 transition-all group-hover:translate-x-1 group-hover:text-primary" />
          </div>
        </div>
      </button>
    </motion.div>
  );
}
