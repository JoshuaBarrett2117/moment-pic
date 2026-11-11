import { motion } from 'motion/react';
import { ArrowRight, FolderOpen, Images } from 'lucide-react';
import { ThrottledImage } from '../ThrottledImage';
import type { DirectoryAlbumNodeDTO } from '../../types/api';
import { galleryAlbumTagColors } from './gallery-album-types';
import { galleryCardItemVariants, getGalleryCardHover, getGalleryCardTagPlacement } from './gallery-card-motion';

type DirectoryNodeCardProps = {
  album: DirectoryAlbumNodeDTO;
  index: number;
  isMobile: boolean;
  onDirectoryNodeClick?: (node: DirectoryAlbumNodeDTO) => void;
};

export function DirectoryNodeCard({
  album,
  index,
  isMobile,
  onDirectoryNodeClick,
}: DirectoryNodeCardProps) {
  const isAlbumNode = album.kind === 'album';
  const colorScheme = album.sourceType ? (galleryAlbumTagColors[album.sourceType] || galleryAlbumTagColors.folder) : galleryAlbumTagColors.folder;

  return (
    <motion.div
      variants={galleryCardItemVariants}
      whileHover={getGalleryCardHover({ index, isMobile })}
      className="group cursor-pointer"
    >
      <button
        onClick={() => onDirectoryNodeClick?.(album)}
        className="relative w-full mp-card p-3 text-left"
      >
        <div className={`absolute -top-3 z-10 rounded-full border border-outline-variant px-3 py-0.5 text-xs font-semibold backdrop-blur-md ${
          getGalleryCardTagPlacement()
        } ${isAlbumNode ? `${colorScheme.bg} ${colorScheme.text}` : 'bg-secondary-container text-on-secondary-container'}`}>
          {isAlbumNode ? (album.sourceType === 'zip' ? '压缩包' : '图集') : '目录'}
        </div>
        <div className="grid aspect-square grid-cols-3 gap-1.5 overflow-hidden rounded-[12px] bg-surface-container-high">
          {album.coverUrl ? (
            <ThrottledImage
              key="cover"
              className="col-span-3 h-full w-full object-cover"
              src={album.coverUrl}
              alt={album.name}
            />
          ) : (
            <div className="col-span-3 flex h-full items-center justify-center">
              {isAlbumNode ? <Images className="h-14 w-14 text-outline/20" /> : <FolderOpen className="h-14 w-14 text-outline/25" />}
            </div>
          )}
        </div>
        <div className="mt-3 px-1 pb-1">
          <h3 className="mb-1 truncate font-headline text-base font-semibold leading-tight text-on-surface" title={album.name}>
            {album.name}
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-sm tabular-nums text-outline">
              {isAlbumNode ? `${album.assetCount} 张` : `${album.childCount} 项`}
            </span>
            <ArrowRight className="h-4 w-4 text-outline/30 transition-all group-hover:translate-x-1 group-hover:text-primary" />
          </div>
        </div>
      </button>
    </motion.div>
  );
}
