import { useCallback, useEffect, useRef } from 'react';
import { useAlbums, useLibraryRoots, useWebSocket, useLibraryScan, useRecentAlbums, useSmartAlbums, useDirectoryAlbums } from '../hooks';
import { Screen } from '../types';
import { SCAN_PARTIAL_FAILURE_MESSAGE } from '../lib/scan-status';
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
  const { albums, isLoading, error, fetchAlbums, cancelRequests: cancelAlbums } = useAlbums();
  const {
    smartAlbums,
    smartAlbumDetail,
    smartAlbumMembers,
    isLoading: isSmartAlbumsLoading,
    fetchSmartAlbums,
    fetchSmartAlbumDetail
    , cancelRequests: cancelSmartAlbums
  } = useSmartAlbums();
  const { recentAlbums, isLoading: isRecentLoading, fetchRecentAlbums, cancelRequests: cancelRecent } = useRecentAlbums();
  const {
    directoryAlbums,
    isLoading: isDirectoryAlbumsLoading,
    fetchDirectoryAlbums
    , cancelRequests: cancelDirectory
  } = useDirectoryAlbums();
  const { libraryRoots, fetchLibraryRoots, cancelRequests: cancelLibraryRoots } = useLibraryRoots();
  const queryKey = JSON.stringify([currentScreen, debouncedKeyword, filters, galleryViewMode, isAuthenticated, isRecentActive, selectedSmartAlbum]);
  const queryRef = useRef({ key: queryKey, generation: 0 });
  if (queryRef.current.key !== queryKey) {
    queryRef.current = { key: queryKey, generation: queryRef.current.generation + 1 };
  }
  const queryGeneration = queryRef.current.generation;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAlbums();
      cancelSmartAlbums();
      cancelRecent();
      cancelDirectory();
      cancelLibraryRoots();
    };
  }, [queryKey, cancelAlbums, cancelSmartAlbums, cancelRecent, cancelDirectory, cancelLibraryRoots]);

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

  const loadFavoriteAlbums = useCallback(() => {
    return fetchAlbums({
      page: filters.page,
      pageSize: filters.pageSize,
      keyword: debouncedKeyword || undefined,
      sortBy: filters.sortBy === 'albumCount' ? 'updatedAt' : filters.sortBy,
      sortOrder: filters.sortOrder,
      sourceType: filters.sourceType || undefined,
      libraryRootId: filters.libraryRootId || undefined,
      favoriteOnly: true,
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

  const loadDirectoryAlbums = useCallback(() => {
    return fetchDirectoryAlbums({
      libraryRootId: filters.directoryLibraryRootId || undefined,
      relativePath: filters.directoryRelativePath || undefined
    });
  }, [fetchDirectoryAlbums, filters.directoryLibraryRootId, filters.directoryRelativePath]);

  const refreshCurrentGallery = useCallback(async () => {
    if (!isAuthenticated || !mountedRef.current || queryRef.current.generation !== queryGeneration) {
      return;
    }

    await fetchLibraryRoots();
    if (!mountedRef.current || queryRef.current.generation !== queryGeneration) return;
    if (galleryViewMode === 'directoryAlbums') {
      await loadDirectoryAlbums();
      return;
    }
    if (galleryViewMode === 'smartAlbums') {
      await loadSmartAlbums();
      return;
    }
    if (galleryViewMode === 'favorites') {
      await loadFavoriteAlbums();
      return;
    }
    if (isRecentActive) {
      await fetchRecentAlbums({ limit: 50 });
      return;
    }

    await loadAlbums();
  }, [fetchLibraryRoots, fetchRecentAlbums, galleryViewMode, isAuthenticated, isRecentActive, loadAlbums, loadDirectoryAlbums, loadFavoriteAlbums, loadSmartAlbums, queryGeneration]);

  const { isScanning, scan, scanningLibraryRootIds, isAnyScanning, scanError: taskScanError } = useLibraryScan({
    onScanComplete: refreshCurrentGallery, enabled: isAuthenticated
  });

  const { isConnected: wsConnected, lastScanComplete } = useWebSocket(
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
    },
    isAuthenticated
  );

  useEffect(() => {
    if ((currentScreen === Screen.GALLERY || currentScreen === Screen.SHARE_MANAGEMENT) && isAuthenticated) {
      void fetchLibraryRoots();
    }
  }, [currentScreen, fetchLibraryRoots, isAuthenticated, queryKey]);

  useEffect(() => {
    if (isAuthenticated && currentScreen === Screen.GALLERY) {
      if (galleryViewMode === 'directoryAlbums') {
        void loadDirectoryAlbums();
        return;
      }
      if (galleryViewMode === 'smartAlbums') {
        void loadSmartAlbums();
        return;
      }
      if (galleryViewMode === 'favorites') {
        void loadFavoriteAlbums();
        return;
      }
      void loadAlbums();
    }
  }, [currentScreen, galleryViewMode, isAuthenticated, loadAlbums, loadDirectoryAlbums, loadFavoriteAlbums, loadSmartAlbums]);

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
      if (galleryViewMode === 'directoryAlbums') {
        void loadDirectoryAlbums();
        return;
      }
      if (galleryViewMode === 'favorites') {
        void loadFavoriteAlbums();
        return;
      }
      void loadAlbums();
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [galleryViewMode, isAnyScanning, isAuthenticated, loadAlbums, loadDirectoryAlbums, loadFavoriteAlbums, loadSmartAlbums, wsConnected]);

  return {
    albums,
    error,
    directoryAlbums,
    fetchLibraryRoots,
    fetchRecentAlbums,
    fetchSmartAlbumDetail,
    isAnyScanning,
    isLoading,
    isDirectoryAlbumsLoading,
    isRecentLoading,
    isScanning,
    isSmartAlbumsLoading,
    libraryRoots,
    loadAlbums,
    loadDirectoryAlbums,
    loadFavoriteAlbums,
    loadSmartAlbums,
    recentAlbums,
    refreshCurrentGallery,
    scan,
    scanningLibraryRootIds,
    scanError: taskScanError ?? (lastScanComplete?.failureCount ? SCAN_PARTIAL_FAILURE_MESSAGE : null),
    smartAlbumDetail,
    smartAlbumMembers,
    smartAlbums,
    wsConnected,
  };
};
