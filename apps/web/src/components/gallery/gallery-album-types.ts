import type { AlbumListItemDTO, DirectoryAlbumNodeDTO, SmartAlbumListItemDTO } from '../../types/api';

export type GalleryAlbum = AlbumListItemDTO | SmartAlbumListItemDTO | DirectoryAlbumNodeDTO;

export const galleryAlbumTagColors: Record<string, { bg: string; text: string }> = {
  folder: { bg: 'bg-[#D4E8CF]', text: 'text-on-secondary-container' },
  zip: { bg: 'bg-[#EDC3B9]', text: 'text-on-primary-container' },
};

export const isDirectoryNode = (album: GalleryAlbum): album is DirectoryAlbumNodeDTO => 'kind' in album;

export const isStandardAlbum = (album: GalleryAlbum): album is AlbumListItemDTO =>
  'sourceType' in album && !isDirectoryNode(album);

export const isSmartAlbum = (album: GalleryAlbum): album is SmartAlbumListItemDTO =>
  !isDirectoryNode(album) && !isStandardAlbum(album);
