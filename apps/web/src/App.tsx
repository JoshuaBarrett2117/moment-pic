import { useCallback, useEffect, lazy, Suspense, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Screen } from './types';
import { LoginScreen } from './components/LoginScreen';
import { PaperGrain } from './components/PaperGrain';
import { useRecentAlbums, recordAlbumView } from './hooks';
import { api } from './lib/api';
import type { AlbumListItemDTO } from './types/api';
import { useGalleryAppState } from './app/gallery-navigation';
import { useGalleryDataController } from './app/use-gallery-data-controller';

const GalleryScreen = lazy(() =>
  import('./components/GalleryScreen').then((module) => ({
    default: module.GalleryScreen
  }))
);
const AlbumDetailScreen = lazy(() =>
  import('./components/AlbumDetailScreen').then((module) => ({
    default: module.AlbumDetailScreen
  }))
);
const SettingsScreen = lazy(() =>
  import('./components/SettingsScreen').then((module) => ({
    default: module.SettingsScreen
  }))
);

export default function App() {
  const {
    activeTab,
    currentScreen,
    debouncedKeyword,
    direction,
    filters,
    galleryViewMode,
    initialNavigation,
    isAuthenticated,
    isRecentActive,
    navigate,
    nextAlbumId,
    resetToLogin,
    scrollPosition,
    selectedAlbum,
    selectedSmartAlbum,
    setActiveTab,
    setCurrentScreen,
    setFilters,
    setGalleryViewMode,
    setIsAuthenticated,
    setIsRecentActive,
    setNextAlbumId,
    setScrollPosition,
    setSelectedAlbum,
    setSelectedSmartAlbum,
    syncHistory,
  } = useGalleryAppState();

  const {
    albums,
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
  } = useGalleryDataController({
    currentScreen,
    debouncedKeyword,
    filters,
    galleryViewMode,
    isAuthenticated,
    isRecentActive,
    selectedSmartAlbum,
  });

  useEffect(() => {
    const verifyAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        resetToLogin();
        return;
      }

      try {
        await api.get('/albums', { page: 1, pageSize: 1 });
        setIsAuthenticated(true);
        setSelectedAlbum(initialNavigation.selectedAlbumId);
        setSelectedSmartAlbum(initialNavigation.selectedSmartAlbumId);
        setIsRecentActive(initialNavigation.isRecentActive);
        setGalleryViewMode(initialNavigation.galleryViewMode);
        setActiveTab(initialNavigation.screen === Screen.SETTINGS ? 'settings' : 'gallery');
        syncHistory(initialNavigation.screen, {
          replace: true,
          selectedAlbumId: initialNavigation.selectedAlbumId,
          selectedSmartAlbumId: initialNavigation.selectedSmartAlbumId,
          isRecentActive: initialNavigation.isRecentActive,
          galleryViewMode: initialNavigation.galleryViewMode,
        });
        setCurrentScreen(initialNavigation.screen);
      } catch {
        resetToLogin();
      }
    };

    void verifyAuth();
  }, [
    initialNavigation,
    resetToLogin,
    setActiveTab,
    setCurrentScreen,
    setGalleryViewMode,
    setIsAuthenticated,
    setIsRecentActive,
    setSelectedAlbum,
    setSelectedSmartAlbum,
    syncHistory,
  ]);

  const handleLogin = useCallback(() => {
    const nextFilters = { ...filters, libraryRootId: '', page: 1 };
    setIsAuthenticated(true);
    localStorage.setItem('auth_token', 'authenticated');
    setFilters(nextFilters);
    setGalleryViewMode('albums');
    void api.get('/albums', { page: nextFilters.page, pageSize: 1 });
    void loadAlbums();
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'albums' });
  }, [filters, loadAlbums, navigate, setFilters, setGalleryViewMode, setIsAuthenticated]);

  const handleNavigateToAlbum = useCallback((albumId: string) => {
    const sourceAlbums = isRecentActive ? (recentAlbums || []) : (albums?.items || []);
    const currentIndex = sourceAlbums.findIndex((album) => album.id === albumId);
    const nextId = currentIndex >= 0 ? sourceAlbums[currentIndex + 1]?.id ?? null : null;

    setSelectedAlbum(albumId);
    setNextAlbumId(nextId);
    void recordAlbumView(albumId);
    navigate(Screen.ALBUM_DETAIL, 1, { selectedAlbumId: albumId, isRecentActive, galleryViewMode });
  }, [albums?.items, galleryViewMode, isRecentActive, navigate, recentAlbums, setNextAlbumId, setSelectedAlbum]);

  const handleNavigateToSmartAlbum = useCallback((smartAlbumId: string) => {
    setSelectedSmartAlbum(smartAlbumId);
    navigate(Screen.SMART_ALBUM_DETAIL, 1, { selectedSmartAlbumId: smartAlbumId, galleryViewMode: 'smartAlbums' });
  }, [navigate, setSelectedSmartAlbum]);

  const handleProfileClick = useCallback(() => {
    localStorage.removeItem('auth_token');
    setIsAuthenticated(false);
    setNextAlbumId(null);
    navigate(Screen.LOGIN, -1);
  }, [navigate, setIsAuthenticated, setNextAlbumId]);

  const handleBackToGallery = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    setActiveTab('gallery');
    setIsRecentActive(false);
    setNextAlbumId(null);
    setSelectedAlbum(null);
    if (currentScreen === Screen.SMART_ALBUM_DETAIL) {
      navigate(Screen.GALLERY, -1, { replace: true, isRecentActive: false, galleryViewMode: 'smartAlbums' });
      return;
    }
    navigate(Screen.GALLERY, -1, { replace: true, isRecentActive: false, galleryViewMode });
  }, [currentScreen, galleryViewMode, navigate, setActiveTab, setIsRecentActive, setNextAlbumId, setSelectedAlbum]);

  const handleSidebarNavigate = useCallback((tab: 'gallery' | 'settings') => {
    setActiveTab(tab);
    setIsRecentActive(false);
    if (tab === 'gallery') {
      const nextFilters = { ...filters, libraryRootId: '', page: 1 };
      setFilters(nextFilters);
      setScrollPosition(0);
      setGalleryViewMode('albums');
      void loadAlbums();
      navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'albums' });
    } else {
      navigate(Screen.SETTINGS, 1);
    }
  }, [filters, loadAlbums, navigate, setActiveTab, setFilters, setGalleryViewMode, setIsRecentActive, setScrollPosition]);

  const handleRecentClick = useCallback(() => {
    setActiveTab('gallery');
    setIsRecentActive(true);
    setGalleryViewMode('albums');
    setFilters((prev) => ({ ...prev, libraryRootId: '', page: 1 }));
    setScrollPosition(0);
    void fetchRecentAlbums({ limit: 50 });
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: true, galleryViewMode: 'albums' });
  }, [fetchRecentAlbums, navigate, setActiveTab, setFilters, setGalleryViewMode, setIsRecentActive, setScrollPosition]);

  const handleSmartAlbumsClick = useCallback(() => {
    setActiveTab('gallery');
    setIsRecentActive(false);
    setGalleryViewMode('smartAlbums');
    setFilters((prev) => ({ ...prev, libraryRootId: '', page: 1, sortBy: 'albumCount', sortOrder: 'desc' }));
    setScrollPosition(0);
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'smartAlbums' });
  }, [navigate, setActiveTab, setFilters, setGalleryViewMode, setIsRecentActive, setScrollPosition]);

  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    setScrollPosition(0);
  }, [setFilters, setScrollPosition]);

  const handleSortByChange = useCallback((sortBy: 'name' | 'updatedAt' | 'assetCount' | 'albumCount') => {
    setFilters((prev) => ({ ...prev, sortBy, page: 1 }));
    setScrollPosition(0);
  }, [setFilters, setScrollPosition]);

  const handleSortOrderChange = useCallback((sortOrder: 'asc' | 'desc') => {
    setFilters((prev) => ({ ...prev, sortOrder }));
    setScrollPosition(0);
  }, [setFilters, setScrollPosition]);

  const handlePageSizeChange = useCallback((pageSize: number) => {
    setFilters((prev) => ({ ...prev, pageSize, page: 1 }));
    setScrollPosition(0);
  }, [setFilters, setScrollPosition]);

  const handleKeywordChange = useCallback((keyword: string) => {
    setFilters((prev) => ({ ...prev, keyword, page: 1 }));
    setScrollPosition(0);
  }, [setFilters, setScrollPosition]);

  const handleSourceTypeChange = useCallback((sourceType: '' | 'folder' | 'zip') => {
    setFilters((prev) => ({ ...prev, sourceType, page: 1 }));
    setScrollPosition(0);
  }, [setFilters, setScrollPosition]);

  const handleLibraryRootChange = useCallback((libraryRootId: string) => {
    const nextFilters = { ...filters, libraryRootId, page: 1 };
    setIsRecentActive(false);
    setGalleryViewMode('albums');
    setFilters(nextFilters);
    setScrollPosition(0);
    setActiveTab('gallery');
    void loadAlbums();
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'albums' });
  }, [filters, loadAlbums, navigate, setActiveTab, setFilters, setGalleryViewMode, setIsRecentActive, setScrollPosition]);

  const handleRefreshAll = useCallback(async () => {
    await scan();
  }, [scan]);

  const handleRefreshOne = useCallback(async (libraryRootId: string) => {
    await scan(libraryRootId);
  }, [scan]);

  const smartAlbumMemberSortBy = filters.sortBy === 'albumCount' ? 'updatedAt' : filters.sortBy;
  const smartAlbumMemberAlbums = useMemo(() => {
    return ((smartAlbumMembers || []).map((member) => ({
      id: member.albumId,
      name: member.name,
      sourceType: member.sourceType,
      assetCount: member.assetCount,
      coverUrl: member.coverUrl,
      updatedAt: member.updatedAt,
    })) as AlbumListItemDTO[])
      .filter((album) => {
        if (filters.sourceType && album.sourceType !== filters.sourceType) {
          return false;
        }

        if (!filters.keyword.trim()) {
          return true;
        }

        return album.name.toLowerCase().includes(filters.keyword.trim().toLowerCase());
      })
      .sort((left, right) => {
        const directionFactor = filters.sortOrder === 'asc' ? 1 : -1;

        if (smartAlbumMemberSortBy === 'name') {
          return left.name.localeCompare(right.name, 'zh-CN') * directionFactor;
        }

        if (smartAlbumMemberSortBy === 'assetCount') {
          return (left.assetCount - right.assetCount) * directionFactor;
        }

        return (new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime()) * directionFactor;
      });
  }, [filters.keyword, filters.sortOrder, filters.sourceType, smartAlbumMemberSortBy, smartAlbumMembers]);

  const variants = {
    enter: (slideDirection: number) => ({
      x: slideDirection > 0 ? '100%' : '-100%',
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (slideDirection: number) => ({
      x: slideDirection < 0 ? '100%' : '-100%',
      opacity: 0
    })
  };

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background">
      <PaperGrain />

      <AnimatePresence initial={false} custom={direction} mode="sync">
        <motion.div
          key={currentScreen}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 200, damping: 35, mass: 1 },
            opacity: { duration: 0.15 }
          }}
          className="absolute inset-0 w-full h-full will-change-transform"
        >
          {(currentScreen === Screen.LOGIN || !isAuthenticated) && (
            <LoginScreen onLogin={handleLogin} />
          )}
          {currentScreen === Screen.GALLERY && isAuthenticated && (
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center text-outline">
                  正在加载图库...
                </div>
              }
            >
              <GalleryScreen
                displayMode={galleryViewMode}
                albums={galleryViewMode === 'smartAlbums'
                  ? (smartAlbums?.items || [])
                  : (isRecentActive ? (recentAlbums || []) : (albums?.items || []))}
                isLoading={galleryViewMode === 'smartAlbums'
                  ? isSmartAlbumsLoading
                  : (isRecentActive ? isRecentLoading : isLoading)}
                pagination={galleryViewMode === 'smartAlbums'
                  ? (smartAlbums?.pagination || null)
                  : (isRecentActive ? null : (albums?.pagination || null))}
                onNavigateToAlbum={galleryViewMode === 'smartAlbums' ? handleNavigateToSmartAlbum : handleNavigateToAlbum}
                onProfileClick={handleProfileClick}
                onRefresh={galleryViewMode === 'smartAlbums' ? loadSmartAlbums : (isRecentActive ? handleRecentClick : loadAlbums)}
                onPageChange={handlePageChange}
                onSortByChange={handleSortByChange}
                onSortOrderChange={handleSortOrderChange}
                onPageSizeChange={handlePageSizeChange}
                onSourceTypeChange={galleryViewMode === 'smartAlbums' ? undefined : handleSourceTypeChange}
                currentSortBy={filters.sortBy}
                currentSortOrder={filters.sortOrder}
                currentPageSize={filters.pageSize}
                currentSourceType={filters.sourceType}
                currentKeyword={filters.keyword}
                activeTab={activeTab}
                onSidebarNavigate={handleSidebarNavigate}
                libraryRoots={libraryRoots}
                currentLibraryRootId={galleryViewMode === 'smartAlbums' ? '' : filters.libraryRootId}
                onLibraryRootChange={handleLibraryRootChange}
                onKeywordChange={handleKeywordChange}
                onScanAll={handleRefreshAll}
                onScanOne={handleRefreshOne}
                isAnyScanning={isAnyScanning}
                isScanning={isScanning}
                onAlbumDeleted={loadAlbums}
                onRecentClick={handleRecentClick}
                isRecentActive={galleryViewMode === 'smartAlbums' ? false : isRecentActive}
                scrollPosition={scrollPosition}
                onScrollPositionChange={setScrollPosition}
                onSmartAlbumsClick={handleSmartAlbumsClick}
                isSmartAlbumsActive={galleryViewMode === 'smartAlbums'}
              />
            </Suspense>
          )}
          {currentScreen === Screen.ALBUM_DETAIL && (
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center text-outline">
                  正在加载相册详情...
                </div>
              }
            >
              <AlbumDetailScreen
                mode="album"
                albumId={selectedAlbum || ''}
                onBack={handleBackToGallery}
                onRequestNextAlbum={nextAlbumId ? () => handleNavigateToAlbum(nextAlbumId) : undefined}
              />
            </Suspense>
          )}
          {currentScreen === Screen.SETTINGS && (
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center text-outline">
                  正在加载设置...
                </div>
              }
            >
              <SettingsScreen
                onBack={handleBackToGallery}
                onScanComplete={refreshCurrentGallery}
              />
            </Suspense>
          )}
          {currentScreen === Screen.SMART_ALBUM_DETAIL && selectedSmartAlbum && (
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center text-outline">
                  正在加载自动整理...
                </div>
              }
            >
              <GalleryScreen
                displayMode="albums"
                albums={smartAlbumMemberAlbums}
                isLoading={isSmartAlbumsLoading}
                pagination={null}
                onNavigateToAlbum={handleNavigateToAlbum}
                onProfileClick={handleProfileClick}
                onRefresh={() => {
                  void fetchSmartAlbumDetail(selectedSmartAlbum);
                }}
                onPageChange={() => {}}
                onSortByChange={handleSortByChange}
                onSortOrderChange={handleSortOrderChange}
                onPageSizeChange={handlePageSizeChange}
                onSourceTypeChange={handleSourceTypeChange}
                currentSortBy={smartAlbumMemberSortBy}
                currentSortOrder={filters.sortOrder}
                currentPageSize={filters.pageSize}
                currentSourceType={filters.sourceType}
                currentKeyword={filters.keyword}
                activeTab={activeTab}
                onSidebarNavigate={handleSidebarNavigate}
                libraryRoots={libraryRoots}
                currentLibraryRootId=""
                onLibraryRootChange={handleLibraryRootChange}
                onKeywordChange={handleKeywordChange}
                onScanAll={handleRefreshAll}
                onScanOne={handleRefreshOne}
                isAnyScanning={isAnyScanning}
                isScanning={isScanning}
                onAlbumDeleted={loadAlbums}
                onRecentClick={handleRecentClick}
                isRecentActive={false}
                scrollPosition={scrollPosition}
                onScrollPositionChange={setScrollPosition}
                onSmartAlbumsClick={handleSmartAlbumsClick}
                isSmartAlbumsActive
                headerTitle={smartAlbumDetail?.name || '分类图集'}
                headerDescription={smartAlbumDetail
                  ? `当前自动整理共收纳 ${smartAlbumDetail.albumCount} 个分类图集，继续进入后才是图集内部图片。`
                  : '正在加载分类图集...'}
                emptyTitle="这个自动整理下还没有分类图集"
                emptyDescription="请先重建自动整理，或者调整当前筛选条件。"
                onBack={handleBackToGallery}
              />
            </Suspense>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
