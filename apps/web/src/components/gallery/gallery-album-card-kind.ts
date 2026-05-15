import { type GalleryAlbum, isDirectoryNode, isSmartAlbum, isStandardAlbum } from './gallery-album-types';

export type GalleryAlbumCardKind = 'directory' | 'smartAlbum' | 'album' | 'unsupported';

export const resolveGalleryAlbumCardKind = (
  album: GalleryAlbum,
  isSmartAlbumsMode: boolean
): GalleryAlbumCardKind => {
  if (isDirectoryNode(album)) {
    return 'directory';
  }

  if (isSmartAlbumsMode && isSmartAlbum(album)) {
    return 'smartAlbum';
  }

  if (isStandardAlbum(album)) {
    return 'album';
  }

  return 'unsupported';
};
