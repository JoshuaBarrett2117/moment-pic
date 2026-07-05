import React from 'react';
import { motion } from 'motion/react';
import type { DirectoryAlbumNodeDTO } from '../../types/api';
import { AlbumCard } from './AlbumCard';
import { DirectoryNodeCard } from './DirectoryNodeCard';
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
};

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
}: GalleryAlbumGridProps) {
  return (
    <motion.div
      variants={galleryGridContainerVariants}
      initial="hidden"
      animate="show"
      className={`grid w-full ${gridGapClass}`}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${albumListItemMinWidth}px, 1fr))` }}
    >
      {isLoading && albums.length === 0 ? (
        <GalleryLoadingAlbumCards isMobile={isMobile} />
      ) : albums.length === 0 ? (
        <GalleryEmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        renderedAlbums.map((album, index) => {
          const cardKind = resolveGalleryAlbumCardKind(album, isSmartAlbumsMode);

          if (cardKind === 'directory' && isDirectoryNode(album)) {
            return (
              <React.Fragment key={album.id}>
                <DirectoryNodeCard
                  album={album}
                  index={index}
                  isMobile={isMobile}
                  onDirectoryNodeClick={onDirectoryNodeClick}
                />
              </React.Fragment>
            );
          }

          if (cardKind === 'smartAlbum' && isSmartAlbum(album)) {
            return (
              <React.Fragment key={album.id}>
                <SmartAlbumCard
                  album={album}
                  index={index}
                  isMobile={isMobile}
                  onNavigateToAlbum={onNavigateToAlbum}
                />
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
                />
              </React.Fragment>
            );
          }

          return null;
        })
      )}
    </motion.div>
  );
}
