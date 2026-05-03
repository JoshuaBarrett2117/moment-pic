import { useCallback, useEffect } from 'react';
import { useAlbums, useLibraryRoots, useWebSocket, useLibraryScan, useRecentAlbums, useSmartAlbums } from '../hooks';
import { Screen } from '../types';
import type { GalleryFilters, GalleryViewMode } from './gallery-navigation';

type UseGalleryDataControllerInput = {
  currentScreen: Screen;
  debouncedKeyword: string;
  filters: GalleryFilters;
  galleryViewMode: GalleryViewMode;
  isAuthenticated: boolean;
  isRecentActive: boolean;
  selectedSmartAlbum: string | null;
};

export const useGalleryDataController = ({
  currentScreen,
  debouncedKeyword,
  filters,
  galleryViewMode,
  isAuthenticated,
  isRecentActive,
  selectedSmartAlbum,
}: UseGalleryDataControllerInput) => {
  const { albums, isLoading, error, fetchAlbums } = useAlbums();
  const {
    smartAlbums,
    smartAlbumDetail,
    smartAlbumMembers,
    isLoading: isSmartAlbumsLoading,
    fetchSmartAlbums,
    fetchSmartAlbumDetail
  } = useSmartAlbums();
  const { recentAlbums, isLoading: isRecentLoading, fetchRecentAlbums } = useRecentAlbums();
  const { libraryRoots, fetchLibraryRoots } = useLibraryRoots();

  const loadAlbums = useCallback(() => {
    return fetchAlbums({
      page: filters.page,
      pageSize: filters.pageSize,
      keyword: debouncedKeyword || undefined,
      sortBy: filters.sortBy === 'albumCount' ? 'updatedAt' : filters.sortBy,
      sortOrder: filters.sortOrder,
      sourceType: filters.sourceType || undefined,
      libraryRootId: filters.libraryRootId || undefined,
    });
  }, [debouncedKeyword, fetchAlbums, filters.libraryRootId, filters.page, filters.pageSize, filters.sortBy, filters.sortOrder, filters.sourceType]);

  const loadSmartAlbums = useCallback(() => {
    return fetchSmartAlbums({
      page: filters.page,
      pageSize: filters.pageSize,
      keyword: debouncedKeyword || undefined,
      sortBy: filters.sortBy === 'albumCount'
        ? 'albumCount'
        : filters.sortBy === 'assetCount'
          ? 'assetCount'
          : filters.sortBy === 'name'
            ? 'name'
            : 'updatedAt',
      sortOrder: filters.sortOrder
    });
  }, [debouncedKeyword, fetchSmartAlbums, filters.page, filters.pageSize, filters.sortBy, filters.sortOrder]);

  const refreshCurrentGallery = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    await fetchLibraryRoots();
    if (galleryViewMode === 'smartAlbums') {
      await loadSmartAlbums();
      return;
    }
    if (isRecentActive) {
      await fetchRecentAlbums({ limit: 50 });
      return;
    }

    await loadAlbums();
  }, [fetchLibraryRoots, fetchRecentAlbums, galleryViewMode, isAuthenticated, isRecentActive, loadAlbums, loadSmartAlbums]);

  const { isScanning, scan, scanningLibraryRootIds, isAnyScanning } = useLibraryScan({
    onScanComplete: refreshCurrentGallery
  });

  const { isConnected: wsConnected } = useWebSocket(
    (event) => {
      if (event.type !== 'unlink' || !isAuthenticated) {
        return;
      }

      if (currentScreen === Screen.GALLERY) {
        void refreshCurrentGallery();
        return;
      }

      if (currentScreen === Screen.SETTINGS) {
        void fetchLibraryRoots();
      }
    },
    () => {
      void refreshCurrentGallery();
    }
  );

  useEffect(() => {
    if (currentScreen === Screen.GALLERY && isAuthenticated) {
      void fetchLibraryRoots();
    }
  }, [currentScreen, fetchLibraryRoots, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && currentScreen === Screen.GALLERY) {
      if (galleryViewMode === 'smartAlbums') {
        void loadSmartAlbums();
        return;
      }
      void loadAlbums();
    }
  }, [currentScreen, galleryViewMode, isAuthenticated, loadAlbums, loadSmartAlbums]);

  useEffect(() => {
    if (!isAuthenticated || currentScreen !== Screen.SMART_ALBUM_DETAIL || !selectedSmartAlbum) {
      return;
    }

    void fetchSmartAlbumDetail(selectedSmartAlbum);
  }, [currentScreen, fetchSmartAlbumDetail, isAuthenticated, selectedSmartAlbum]);

  useEffect(() => {
    if (!isAuthenticated || !isAnyScanning || wsConnected) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (galleryViewMode === 'smartAlbums') {
        void loadSmartAlbums();
        return;
      }
      void loadAlbums();
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [galleryViewMode, isAnyScanning, isAuthenticated, loadAlbums, loadSmartAlbums, wsConnected]);

  return {
    albums,
    error,
    fetchLibraryRoots,
    fetchRecentAlbums,
    fetchSmartAlbumDetail,
    isAnyScanning,
    isLoading,
    isRecentLoading,
    isScanning,
    isSmartAlbumsLoading,
    libraryRoots,
    loadAlbums,
    loadSmartAlbums,
    recentAlbums,
    refreshCurrentGallery,
    scan,
    scanningLibraryRootIds,
    smartAlbumDetail,
    smartAlbumMembers,
    smartAlbums,
    wsConnected,
  };
};
