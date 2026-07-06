import { useCallback, useEffect, lazy, Suspense, useMemo } from 'react';
import { Screen } from './types';
import { LoginScreen } from './components/LoginScreen';
import { PaperGrain } from './components/PaperGrain';
import { useRecentAlbums, recordAlbumView, setAlbumFavorite, useSystemConfig } from './hooks';
import { api } from './lib/api';
import type { AlbumListItemDTO, DirectoryAlbumBreadcrumbDTO, DirectoryAlbumNodeDTO } from './types/api';
import { clearAuthSession, markAuthSession } from './app/auth-session';
import { useGalleryAppState } from './app/gallery-navigation';
import { buildDirectoryNavigationAlbums, buildGalleryScreenModel, resolveNextAlbumId } from './app/gallery-screen-model';
import { buildSmartAlbumMemberAlbums, resolveSmartAlbumMemberSortBy } from './app/smart-album-member-albums';
import { useGalleryDataController } from './app/use-gallery-data-controller';
import { useAppAuthBootstrap } from './app/useAppAuthBootstrap';
import { useGalleryFilterActions } from './app/useGalleryFilterActions';
import { PageTransitionFrame } from './app/PageTransitionFrame';

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
const ShareManagementScreen = lazy(() =>
  import('./components/ShareManagementScreen').then((module) => ({
    default: module.ShareManagementScreen
  }))
);
const SharedAlbumScreen = lazy(() =>
  import('./components/SharedAlbumScreen').then((module) => ({
    default: module.SharedAlbumScreen
  }))
);

const getShareTokenFromPath = (): string => {
  if (!window.location.pathname.startsWith('/share/')) {
    return '';
  }

  return decodeURIComponent(window.location.pathname.slice('/share/'.length));
};

const SharedAlbumApp = ({ token }: { token: string }) => (
  <div className="relative w-full h-[100dvh] overflow-hidden bg-background">
    <PaperGrain />
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center text-outline">
          正在加载分享图集...
        </div>
      }
    >
      <SharedAlbumScreen token={token} />
    </Suspense>
  </div>
);

function AuthenticatedMomentPicApp() {
  const { systemConfig, fetchSystemConfig } = useSystemConfig();
  const {
    activeTab,
    currentScreen,
    debouncedKeyword,
    direction,
    filters,
    galleryViewMode,
    initialFilters,
    initialNavigation,
    isAuthenticated,
    isRecentActive,
    navigate,
    nextAlbumId,
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
  } = useGalleryAppState();

  const {
    albums,
    directoryAlbums,
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
    if (isAuthenticated) {
      void fetchSystemConfig();
    }
  }, [fetchSystemConfig, isAuthenticated]);

  const isAuthBootstrapping = useAppAuthBootstrap({
    initialFilters,
    initialNavigation,
    setActiveTab,
    setCurrentScreen,
    setGalleryViewMode,
    setIsAuthenticated,
    setIsRecentActive,
    setNextAlbumId,
    setSelectedAlbum,
    setSelectedSmartAlbum,
  });
  const {
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
  } = useGalleryFilterActions({
    filters,
    setFilters,
    setScrollPosition,
  });

  const smartAlbumMemberSortBy = resolveSmartAlbumMemberSortBy(filters.sortBy);
  const smartAlbumMemberAlbums = useMemo(() => {
    return buildSmartAlbumMemberAlbums(smartAlbumMembers, filters);
  }, [filters, smartAlbumMembers]);
  const directoryNavigationAlbums = useMemo(() => buildDirectoryNavigationAlbums(directoryAlbums?.items), [directoryAlbums?.items]);
  const albumNavigationSource = useMemo(() => {
    if (galleryViewMode === 'smartAlbums' && selectedSmartAlbum) {
      return smartAlbumMemberAlbums;
    }

    if (galleryViewMode === 'directoryAlbums') {
      return directoryNavigationAlbums;
    }

    return isRecentActive ? (recentAlbums || []) : (albums?.items || []);
  }, [
    albums?.items,
    directoryNavigationAlbums,
    galleryViewMode,
    isRecentActive,
    recentAlbums,
    selectedSmartAlbum,
    smartAlbumMemberAlbums,
  ]);

  const handleLogin = useCallback(() => {
    const nextFilters = resetToAlbumFilters();
    markAuthSession();
    setIsAuthenticated(true);
    setGalleryViewMode('albums');
    void api.get('/albums', { page: nextFilters.page, pageSize: 1 });
    void loadAlbums();
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'albums' });
  }, [loadAlbums, navigate, resetToAlbumFilters, setGalleryViewMode, setIsAuthenticated]);

  const handleNavigateToAlbum = useCallback((albumId: string) => {
    const nextId = resolveNextAlbumId(albumNavigationSource, albumId);

    setSelectedAlbum(albumId);
    setNextAlbumId(nextId);
    void recordAlbumView(albumId);
    navigate(Screen.ALBUM_DETAIL, 1, { selectedAlbumId: albumId, isRecentActive, galleryViewMode });
  }, [albumNavigationSource, galleryViewMode, isRecentActive, navigate, setNextAlbumId, setSelectedAlbum]);

  useEffect(() => {
    if (currentScreen !== Screen.ALBUM_DETAIL || !selectedAlbum) {
      return;
    }

    setNextAlbumId(resolveNextAlbumId(albumNavigationSource, selectedAlbum));
  }, [albumNavigationSource, currentScreen, selectedAlbum, setNextAlbumId]);

  const handleNavigateToSmartAlbum = useCallback((smartAlbumId: string) => {
    setSelectedSmartAlbum(smartAlbumId);
    navigate(Screen.SMART_ALBUM_DETAIL, 1, { selectedSmartAlbumId: smartAlbumId, galleryViewMode: 'smartAlbums' });
  }, [navigate, setSelectedSmartAlbum]);

  const handleProfileClick = useCallback(() => {
    clearAuthSession();
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
      resetToAlbumFilters();
      setGalleryViewMode('albums');
      void loadAlbums();
      navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'albums' });
    } else {
      navigate(Screen.SETTINGS, 1);
    }
  }, [loadAlbums, navigate, resetToAlbumFilters, setActiveTab, setGalleryViewMode, setIsRecentActive]);

  const handleRecentClick = useCallback(() => {
    setActiveTab('gallery');
    setIsRecentActive(true);
    setGalleryViewMode('albums');
    resetToAlbumFilters();
    void fetchRecentAlbums({ limit: 50 });
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: true, galleryViewMode: 'albums' });
  }, [fetchRecentAlbums, navigate, resetToAlbumFilters, setActiveTab, setGalleryViewMode, setIsRecentActive]);

  const handleSmartAlbumsClick = useCallback(() => {
    setActiveTab('gallery');
    setIsRecentActive(false);
    setGalleryViewMode('smartAlbums');
    activateSmartAlbumsFilters();
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'smartAlbums' });
  }, [activateSmartAlbumsFilters, navigate, setActiveTab, setGalleryViewMode, setIsRecentActive]);

  const handleDirectoryAlbumsClick = useCallback(() => {
    setActiveTab('gallery');
    setIsRecentActive(false);
    setGalleryViewMode('directoryAlbums');
    activateDirectoryAlbumsFilters();
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'directoryAlbums' });
  }, [activateDirectoryAlbumsFilters, navigate, setActiveTab, setGalleryViewMode, setIsRecentActive]);

  const handleFavoritesClick = useCallback(() => {
    setActiveTab('gallery');
    setIsRecentActive(false);
    setGalleryViewMode('favorites');
    resetToAlbumFilters();
    void loadFavoriteAlbums();
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'favorites' });
  }, [loadFavoriteAlbums, navigate, resetToAlbumFilters, setActiveTab, setGalleryViewMode, setIsRecentActive]);

  const handleShareManagementClick = useCallback(() => {
    setActiveTab('gallery');
    setIsRecentActive(false);
    navigate(Screen.SHARE_MANAGEMENT, 1, { replace: true, isRecentActive: false, galleryViewMode });
  }, [galleryViewMode, navigate, setActiveTab, setIsRecentActive]);

  const handleDirectoryNodeClick = useCallback((node: DirectoryAlbumNodeDTO) => {
    if (node.kind === 'album' && node.albumId) {
      handleNavigateToAlbum(node.albumId);
      return;
    }

    enterDirectoryNodeFilters({
      libraryRootId: node.libraryRootId,
      relativePath: node.relativePath,
    });
  }, [enterDirectoryNodeFilters, handleNavigateToAlbum]);

  const handleDirectoryBreadcrumbClick = useCallback((crumb: DirectoryAlbumBreadcrumbDTO) => {
    enterDirectoryNodeFilters({
      libraryRootId: crumb.libraryRootId ?? '',
      relativePath: crumb.relativePath,
    });
  }, [enterDirectoryNodeFilters]);

  const handleLibraryRootChange = useCallback((libraryRootId: string) => {
    handleLibraryRootChangeFilters(libraryRootId);
    setIsRecentActive(false);
    setGalleryViewMode('albums');
    setActiveTab('gallery');
    void loadAlbums();
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'albums' });
  }, [handleLibraryRootChangeFilters, loadAlbums, navigate, setActiveTab, setGalleryViewMode, setIsRecentActive]);

  const handleRefreshAll = useCallback(async () => {
    await scan();
  }, [scan]);

  const handleRefreshOne = useCallback(async (libraryRootId: string) => {
    await scan(libraryRootId);
  }, [scan]);

  const handleAlbumFavoriteToggle = useCallback(async (album: AlbumListItemDTO) => {
    const result = await setAlbumFavorite(album.id, !album.isFavorite);
    if (!result) {
      return;
    }

    await refreshCurrentGallery();
  }, [refreshCurrentGallery]);

  const galleryScreenModel = useMemo(() => buildGalleryScreenModel({
    galleryViewMode,
    isRecentActive,
    libraryRootId: filters.libraryRootId,
    albums,
    recentAlbums,
    smartAlbums,
    directoryAlbums,
    isLoading,
    isRecentLoading,
    isSmartAlbumsLoading,
    isDirectoryAlbumsLoading,
  }), [
    albums,
    directoryAlbums,
    filters.libraryRootId,
    galleryViewMode,
    isDirectoryAlbumsLoading,
    isLoading,
    isRecentActive,
    isRecentLoading,
    isSmartAlbumsLoading,
    recentAlbums,
    smartAlbums,
  ]);
  const galleryRefreshHandler = galleryViewMode === 'smartAlbums'
    ? loadSmartAlbums
    : galleryViewMode === 'directoryAlbums'
      ? loadDirectoryAlbums
      : galleryViewMode === 'favorites'
        ? loadFavoriteAlbums
      : isRecentActive
        ? handleRecentClick
        : loadAlbums;

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background">
      <PaperGrain />

      {isAuthBootstrapping ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface text-outline">
          正在进入图库...
        </div>
      ) : (
        <PageTransitionFrame
          screenKey={currentScreen}
          direction={direction}
          mode={systemConfig?.pageTransitionMode ?? 'page'}
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
                albums={galleryScreenModel.albums}
                isLoading={galleryScreenModel.isLoading}
                pagination={galleryScreenModel.pagination}
                onNavigateToAlbum={galleryViewMode === 'smartAlbums' ? handleNavigateToSmartAlbum : handleNavigateToAlbum}
                onProfileClick={handleProfileClick}
                onRefresh={galleryRefreshHandler}
                onPageChange={handlePageChange}
                onSortByChange={handleSortByChange}
                onSortOrderChange={handleSortOrderChange}
                onPageSizeChange={handlePageSizeChange}
                onSourceTypeChange={galleryScreenModel.canChangeSourceType ? handleSourceTypeChange : undefined}
                currentSortBy={filters.sortBy}
                currentSortOrder={filters.sortOrder}
                currentPageSize={filters.pageSize}
                currentSourceType={filters.sourceType}
                currentKeyword={filters.keyword}
                activeTab={activeTab}
                onSidebarNavigate={handleSidebarNavigate}
                libraryRoots={libraryRoots}
                currentLibraryRootId={galleryScreenModel.currentLibraryRootId}
                onLibraryRootChange={handleLibraryRootChange}
                onKeywordChange={handleKeywordChange}
                onScanAll={handleRefreshAll}
                onScanOne={handleRefreshOne}
                isAnyScanning={isAnyScanning}
                isScanning={isScanning}
                onAlbumDeleted={loadAlbums}
                onRecentClick={handleRecentClick}
                isRecentActive={galleryScreenModel.isRecentActive}
                scrollPosition={scrollPosition}
                onScrollPositionChange={setScrollPosition}
                onSmartAlbumsClick={handleSmartAlbumsClick}
                isSmartAlbumsActive={galleryViewMode === 'smartAlbums'}
                onDirectoryAlbumsClick={handleDirectoryAlbumsClick}
                isDirectoryAlbumsActive={galleryViewMode === 'directoryAlbums'}
                onFavoritesClick={handleFavoritesClick}
                isFavoritesActive={galleryViewMode === 'favorites'}
                onShareManagementClick={handleShareManagementClick}
                isShareManagementActive={currentScreen === Screen.SHARE_MANAGEMENT}
                onDirectoryNodeClick={handleDirectoryNodeClick}
                directoryBreadcrumbs={directoryAlbums?.breadcrumbs || []}
                onDirectoryBreadcrumbClick={handleDirectoryBreadcrumbClick}
                onAlbumFavoriteToggle={handleAlbumFavoriteToggle}
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
                onSystemConfigChange={fetchSystemConfig}
              />
            </Suspense>
          )}
          {currentScreen === Screen.SHARE_MANAGEMENT && (
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center text-outline">
                  正在加载分享管理...
                </div>
              }
            >
              <ShareManagementScreen
                activeTab={activeTab}
                albumCount={galleryScreenModel.pagination?.total || albums?.pagination.total || 0}
                libraryRoots={libraryRoots}
                currentLibraryRootId={galleryScreenModel.currentLibraryRootId}
                isAnyScanning={isAnyScanning}
                isScanning={isScanning}
                onBack={handleBackToGallery}
                onNavigate={handleSidebarNavigate}
                onLibraryRootChange={handleLibraryRootChange}
                onScanAll={handleRefreshAll}
                onScanOne={handleRefreshOne}
                onRecentClick={handleRecentClick}
                onSmartAlbumsClick={handleSmartAlbumsClick}
                onDirectoryAlbumsClick={handleDirectoryAlbumsClick}
                onFavoritesClick={handleFavoritesClick}
                onShareManagementClick={handleShareManagementClick}
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
                onDirectoryAlbumsClick={handleDirectoryAlbumsClick}
                isDirectoryAlbumsActive={false}
                onFavoritesClick={handleFavoritesClick}
                isFavoritesActive={false}
                onShareManagementClick={handleShareManagementClick}
                isShareManagementActive={currentScreen === Screen.SHARE_MANAGEMENT}
                headerTitle={smartAlbumDetail?.name || '分类图集'}
                headerDescription={smartAlbumDetail
                  ? `当前自动整理共收纳 ${smartAlbumDetail.albumCount} 个分类图集，继续进入后才是图集内部图片。`
                  : '正在加载分类图集...'}
                emptyTitle="这个自动整理下还没有分类图集"
                emptyDescription="请先重建自动整理，或者调整当前筛选条件。"
                onBack={handleBackToGallery}
                onAlbumFavoriteToggle={handleAlbumFavoriteToggle}
              />
            </Suspense>
          )}
        </PageTransitionFrame>
      )}
    </div>
  );
}

export default function App() {
  const shareToken = getShareTokenFromPath();
  if (shareToken) {
    return <SharedAlbumApp token={shareToken} />;
  }

  return <AuthenticatedMomentPicApp />;
}
