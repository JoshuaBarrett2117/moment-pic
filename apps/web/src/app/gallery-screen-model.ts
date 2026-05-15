import type {
  AlbumListItemDTO,
  DirectoryAlbumNodeDTO,
  PaginationDTO,
  SmartAlbumListItemDTO,
} from '../types/api';
import type { GalleryViewMode } from './gallery-navigation';

export type GalleryScreenAlbum = AlbumListItemDTO | SmartAlbumListItemDTO | DirectoryAlbumNodeDTO;

export type GalleryScreenModel = {
  albums: GalleryScreenAlbum[];
  isLoading: boolean;
  pagination: PaginationDTO | null;
  isRecentActive: boolean;
  currentLibraryRootId: string;
  canChangeSourceType: boolean;
};

export const buildGalleryScreenModel = (input: {
  galleryViewMode: GalleryViewMode;
  isRecentActive: boolean;
  libraryRootId: string;
  albums: { items: AlbumListItemDTO[]; pagination: PaginationDTO } | null | undefined;
  recentAlbums: AlbumListItemDTO[] | null | undefined;
  smartAlbums: { items: SmartAlbumListItemDTO[]; pagination: PaginationDTO } | null | undefined;
  directoryAlbums: { items: DirectoryAlbumNodeDTO[] } | null | undefined;
  isLoading: boolean;
  isRecentLoading: boolean;
  isSmartAlbumsLoading: boolean;
  isDirectoryAlbumsLoading: boolean;
}): GalleryScreenModel => {
  if (input.galleryViewMode === 'smartAlbums') {
    return {
      albums: input.smartAlbums?.items || [],
      isLoading: input.isSmartAlbumsLoading,
      pagination: input.smartAlbums?.pagination || null,
      isRecentActive: false,
      currentLibraryRootId: '',
      canChangeSourceType: false,
    };
  }

  if (input.galleryViewMode === 'directoryAlbums') {
    return {
      albums: input.directoryAlbums?.items || [],
      isLoading: input.isDirectoryAlbumsLoading,
      pagination: null,
      isRecentActive: false,
      currentLibraryRootId: '',
      canChangeSourceType: false,
    };
  }

  if (input.isRecentActive) {
    return {
      albums: input.recentAlbums || [],
      isLoading: input.isRecentLoading,
      pagination: null,
      isRecentActive: true,
      currentLibraryRootId: input.libraryRootId,
      canChangeSourceType: true,
    };
  }

  return {
    albums: input.albums?.items || [],
    isLoading: input.isLoading,
    pagination: input.albums?.pagination || null,
    isRecentActive: false,
    currentLibraryRootId: input.libraryRootId,
    canChangeSourceType: true,
  };
};

export const resolveNextAlbumId = (
  sourceAlbums: AlbumListItemDTO[] | null | undefined,
  currentAlbumId: string
): string | null => {
  const albums = sourceAlbums || [];
  const currentIndex = albums.findIndex((album) => album.id === currentAlbumId);
  return currentIndex >= 0 ? albums[currentIndex + 1]?.id ?? null : null;
};
