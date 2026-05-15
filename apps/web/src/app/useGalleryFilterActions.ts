import { type Dispatch, type SetStateAction, useCallback } from 'react';
import type { GalleryFilters, GallerySortBy } from './gallery-navigation';

type UseGalleryFilterActionsInput = {
  filters: GalleryFilters;
  setFilters: Dispatch<SetStateAction<GalleryFilters>>;
  setScrollPosition: (position: number) => void;
};

export function useGalleryFilterActions({
  filters,
  setFilters,
  setScrollPosition,
}: UseGalleryFilterActionsInput) {
  const resetScroll = useCallback(() => {
    setScrollPosition(0);
  }, [setScrollPosition]);

  const updateFilters = useCallback((updater: (prev: GalleryFilters) => GalleryFilters) => {
    setFilters(updater);
    resetScroll();
  }, [resetScroll, setFilters]);

  const handlePageChange = useCallback((page: number) => {
    updateFilters((prev) => ({ ...prev, page }));
  }, [updateFilters]);

  const handleSortByChange = useCallback((sortBy: GallerySortBy) => {
    updateFilters((prev) => ({ ...prev, sortBy, page: 1 }));
  }, [updateFilters]);

  const handleSortOrderChange = useCallback((sortOrder: 'asc' | 'desc') => {
    updateFilters((prev) => ({ ...prev, sortOrder }));
  }, [updateFilters]);

  const handlePageSizeChange = useCallback((pageSize: number) => {
    updateFilters((prev) => ({ ...prev, pageSize, page: 1 }));
  }, [updateFilters]);

  const handleKeywordChange = useCallback((keyword: string) => {
    updateFilters((prev) => ({ ...prev, keyword, page: 1 }));
  }, [updateFilters]);

  const handleSourceTypeChange = useCallback((sourceType: '' | 'folder' | 'zip') => {
    updateFilters((prev) => ({ ...prev, sourceType, page: 1 }));
  }, [updateFilters]);

  const resetToAlbumFilters = useCallback(() => {
    const nextFilters = { ...filters, libraryRootId: '', page: 1 };
    setFilters(nextFilters);
    resetScroll();
    return nextFilters;
  }, [filters, resetScroll, setFilters]);

  const handleLibraryRootChangeFilters = useCallback((libraryRootId: string) => {
    const nextFilters = { ...filters, libraryRootId, page: 1 };
    setFilters(nextFilters);
    resetScroll();
    return nextFilters;
  }, [filters, resetScroll, setFilters]);

  const activateSmartAlbumsFilters = useCallback(() => {
    updateFilters((prev) => ({ ...prev, libraryRootId: '', page: 1, sortBy: 'albumCount', sortOrder: 'desc' }));
  }, [updateFilters]);

  const activateDirectoryAlbumsFilters = useCallback(() => {
    updateFilters((prev) => ({
      ...prev,
      libraryRootId: '',
      directoryLibraryRootId: '',
      directoryRelativePath: '',
      page: 1,
    }));
  }, [updateFilters]);

  const enterDirectoryNodeFilters = useCallback((input: { libraryRootId: string; relativePath: string }) => {
    updateFilters((prev) => ({
      ...prev,
      directoryLibraryRootId: input.libraryRootId,
      directoryRelativePath: input.relativePath,
      page: 1,
    }));
  }, [updateFilters]);

  return {
    activateDirectoryAlbumsFilters,
    activateSmartAlbumsFilters,
    enterDirectoryNodeFilters,
    handleKeywordChange,
    handleLibraryRootChangeFilters,
    handlePageChange,
    handlePageSizeChange,
    handleSortByChange,
    handleSortOrderChange,
    handleSourceTypeChange,
    resetToAlbumFilters,
  };
}
