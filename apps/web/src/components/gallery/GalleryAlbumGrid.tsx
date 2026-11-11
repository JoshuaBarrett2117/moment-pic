import React from 'react';
import { motion } from 'motion/react';
import type { AlbumListItemDTO, DirectoryAlbumNodeDTO } from '../../types/api';
import { AlbumCard } from './AlbumCard';
import { DirectoryFolderRow, DirectoryNodeCard } from './DirectoryNodeCard';
import { GalleryEmptyState } from './GalleryEmptyState';
import { GalleryLoadingAlbumCards } from './GalleryLoadingAlbumCards';
import { SmartAlbumCard } from './SmartAlbumCard';
import { resolveGalleryAlbumCardKind } from './gallery-album-card-kind';
import { galleryGridContainerVariants } from './gallery-card-motion';
import { type GalleryAlbum, isDirectoryNode, isSmartAlbum, isStandardAlbum } from './gallery-album-types';

type GalleryAlbumGridProps = {
  albums: GalleryAlbum[];
  renderedAlbums: GalleryAlbum[];
  isLoading: boolean;
  isMobile: boolean;
  isSmartAlbumsMode: boolean;
  gridGapClass: string;
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
  renderedAlbums,
  isLoading,
  isMobile,
  isSmartAlbumsMode,
  gridGapClass,
  albumListItemMinWidth,
  emptyTitle,
  emptyDescription,
  onNavigateToAlbum,
  onDirectoryNodeClick,
  onAlbumFavoriteToggle,
  onAlbumShare,
}: GalleryAlbumGridProps) {
  const folders = renderedAlbums.filter(isFolderNode);
  const cards = renderedAlbums.filter((album) => !isFolderNode(album));

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
      <motion.div
        variants={galleryGridContainerVariants}
        initial="hidden"
        animate="show"
        className={`grid w-full ${gridGapClass}`}
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${albumListItemMinWidth}px), 1fr))` }}
      >
        {isLoading && albums.length === 0 ? (
          <GalleryLoadingAlbumCards isMobile={isMobile} />
        ) : albums.length === 0 ? (
          <GalleryEmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          cards.map((album, index) => {
            const cardKind = resolveGalleryAlbumCardKind(album, isSmartAlbumsMode);

            if (cardKind === 'directory' && isDirectoryNode(album)) {
              return (
                <React.Fragment key={album.id}>
                  <DirectoryNodeCard album={album} index={index} isMobile={isMobile} onDirectoryNodeClick={onDirectoryNodeClick} />
                </React.Fragment>
              );
            }

            if (cardKind === 'smartAlbum' && isSmartAlbum(album)) {
              return (
                <React.Fragment key={album.id}>
                  <SmartAlbumCard album={album} index={index} isMobile={isMobile} onNavigateToAlbum={onNavigateToAlbum} />
                </React.Fragment>
              );
            }

            if (cardKind === 'album' && isStandardAlbum(album)) {
              return (
                <React.Fragment key={album.id}>
                  <AlbumCard
                    album={album}
                    index={index}
                    isMobile={isMobile}
                    onNavigateToAlbum={onNavigateToAlbum}
                    onFavoriteToggle={onAlbumFavoriteToggle}
                    onShare={onAlbumShare}
                  />
                </React.Fragment>
              );
            }

            return null;
          })
        )}
      </motion.div>
    </>
  );
}
