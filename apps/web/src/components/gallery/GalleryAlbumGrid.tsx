import type { RefObject } from 'react';
import { motion } from 'motion/react';
import type { AlbumListItemDTO, DirectoryAlbumNodeDTO } from '../../types/api';
import { AlbumCard } from './AlbumCard';
import { DirectoryFolderRow, DirectoryNodeCard } from './DirectoryNodeCard';
import { GalleryEmptyState } from './GalleryEmptyState';
import { GalleryLoadingAlbumCards } from './GalleryLoadingAlbumCards';
import { SmartAlbumCard } from './SmartAlbumCard';
import { VirtualGrid } from '../VirtualGrid';
import { resolveGalleryAlbumCardKind } from './gallery-album-card-kind';
import { galleryGridContainerVariants } from './gallery-card-motion';
import { type GalleryAlbum, isDirectoryNode, isSmartAlbum, isStandardAlbum } from './gallery-album-types';

type GalleryAlbumGridProps = {
  albums: GalleryAlbum[];
  isLoading: boolean;
  isMobile: boolean;
  isSmartAlbumsMode: boolean;
  gridGapClass: string;
  /** 卡片间距（像素），与 gridGapClass 保持一致，供虚拟化计算行位置 */
  gridGap: number;
  /** 滚动容器（主区域） */
  scrollElementRef: RefObject<HTMLElement | null>;
  albumListItemMinWidth: number;
  emptyTitle: string;
  emptyDescription: string;
  onNavigateToAlbum: (albumId: string) => void;
  onDirectoryNodeClick?: (node: DirectoryAlbumNodeDTO) => void;
  onAlbumFavoriteToggle?: (album: AlbumListItemDTO) => void;
  onAlbumShare?: (album: AlbumListItemDTO) => void;
};

const isFolderNode = (album: GalleryAlbum): album is DirectoryAlbumNodeDTO => isDirectoryNode(album) && album.kind !== 'album';

export function GalleryAlbumGrid({
  albums,
  isLoading,
  isMobile,
  isSmartAlbumsMode,
  gridGapClass,
  gridGap,
  scrollElementRef,
  albumListItemMinWidth,
  emptyTitle,
  emptyDescription,
  onNavigateToAlbum,
  onDirectoryNodeClick,
  onAlbumFavoriteToggle,
  onAlbumShare,
}: GalleryAlbumGridProps) {
  const folders = albums.filter(isFolderNode);
  const cards = albums.filter((album) => !isFolderNode(album));

  const renderCard = (album: GalleryAlbum, index: number) => {
    const cardKind = resolveGalleryAlbumCardKind(album, isSmartAlbumsMode);
    if (cardKind === 'directory' && isDirectoryNode(album)) {
      return <DirectoryNodeCard album={album} index={index} isMobile={isMobile} onDirectoryNodeClick={onDirectoryNodeClick} />;
    }
    if (cardKind === 'smartAlbum' && isSmartAlbum(album)) {
      return <SmartAlbumCard album={album} index={index} isMobile={isMobile} onNavigateToAlbum={onNavigateToAlbum} />;
    }
    if (cardKind === 'album' && isStandardAlbum(album)) {
      return (
        <AlbumCard
          album={album}
          index={index}
          isMobile={isMobile}
          onNavigateToAlbum={onNavigateToAlbum}
          onFavoriteToggle={onAlbumFavoriteToggle}
          onShare={onAlbumShare}
        />
      );
    }
    return null;
  };

  const gridTemplateColumns = `repeat(auto-fill, minmax(min(100%, ${albumListItemMinWidth}px), 1fr))`;

  return (
    <>
      {folders.length > 0 && (
        <motion.div
          variants={galleryGridContainerVariants}
          initial="hidden"
          animate="show"
          className="mb-6 grid gap-2.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))' }}
          aria-label="子文件夹"
        >
          {folders.map((folder) => (
            <DirectoryFolderRow key={folder.id} node={folder} onClick={onDirectoryNodeClick} />
          ))}
        </motion.div>
      )}
      {isLoading && albums.length === 0 ? (
        <motion.div variants={galleryGridContainerVariants} initial="hidden" animate="show" className={`grid w-full ${gridGapClass}`} style={{ gridTemplateColumns }}>
          <GalleryLoadingAlbumCards isMobile={isMobile} />
        </motion.div>
      ) : albums.length === 0 ? (
        <div className={`grid w-full ${gridGapClass}`} style={{ gridTemplateColumns }}>
          <GalleryEmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        // 按行虚拟化：只保留视口前后约 3 屏的卡片（相册可达数千个）；卡片不再做逐个入场动画
        <VirtualGrid
          items={cards}
          getKey={(album) => album.id}
          renderItem={renderCard}
          minItemWidth={albumListItemMinWidth}
          gap={gridGap}
          // 封面 4:5；有扫描错误提示的卡片会更高，渲染后按实测修正
          estimateRowHeight={(itemWidth) => Math.round(itemWidth * 1.25)}
          scrollElementRef={scrollElementRef}
          className="w-full"
        />
      )}
    </>
  );
}
