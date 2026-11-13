import { m } from 'motion/react';
import { ChevronRight, FolderOpen, Images } from 'lucide-react';
import type { DirectoryAlbumNodeDTO } from '../../types/api';
import { CoverCard } from './CoverCard';
import { galleryCardItemVariants } from './gallery-card-motion';

type DirectoryNodeCardProps = {
  album: DirectoryAlbumNodeDTO;
  index: number;
  isMobile: boolean;
  onDirectoryNodeClick?: (node: DirectoryAlbumNodeDTO) => void;
};

/** 目录里的图集节点：与相册卡片同样式。 */
export function DirectoryNodeCard({ album, onDirectoryNodeClick }: DirectoryNodeCardProps) {
  if (album.kind !== 'album') {
    return <DirectoryFolderRow node={album} onClick={onDirectoryNodeClick} />;
  }
  return (
    <CoverCard
      title={album.name}
      meta={`${album.assetCount} 张`}
      coverUrl={album.coverUrl}
      placeholderIcon={<Images className="h-12 w-12" />}
      tag={album.sourceType === 'zip' ? '压缩包' : '图集'}
      onOpen={() => onDirectoryNodeClick?.(album)}
    />
  );
}

/** 子文件夹：紧凑横条，与图集网格分开展示。 */
export function DirectoryFolderRow({ node, onClick }: { node: DirectoryAlbumNodeDTO; onClick?: (node: DirectoryAlbumNodeDTO) => void }) {
  return (
    <m.button
      variants={galleryCardItemVariants}
      type="button"
      onClick={() => onClick?.(node)}
      className="group flex w-full items-center gap-3 mp-glass-panel rounded-xl px-3 py-2.5 text-left transition-colors hover:border-outline"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container text-primary">
        <FolderOpen className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-on-surface" title={node.name}>{node.name}</span>
        <span className="block text-xs tabular-nums text-outline">{node.childCount} 项</span>
      </span>
      <ChevronRight className="h-4 w-4 text-outline transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </m.button>
  );
}
