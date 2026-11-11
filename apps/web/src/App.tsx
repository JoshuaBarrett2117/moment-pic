import { useCallback, useEffect, Suspense, useMemo } from 'react';
import { Screen } from './types';
import { LoginScreen } from './components/LoginScreen';
import { ThemeBackdrop } from './components/ThemeBackdrop';
import { recordAlbumView, setAlbumFavorite, useSystemConfig } from './hooks';
import { api } from './lib/api';
import type { AlbumListItemDTO, DirectoryAlbumBreadcrumbDTO, DirectoryAlbumNodeDTO } from './types/api';
import { clearAuthSession, markAuthSession } from './app/auth-session';
import { useGalleryAppState } from './app/gallery-navigation';
import { buildDirectoryNavigationAlbums, buildGalleryScreenModel, resolveNextAlbumId } from './app/gallery-screen-model';
import { buildSmartAlbumMemberAlbums, resolveSmartAlbumMemberSortBy } from './app/smart-album-member-albums';
import { useGalleryDataController } from './app/use-gallery-data-controller';
import { useAppAuthBootstrap } from './app/useAppAuthBootstrap';
import { useGalleryFilterActions } from './app/useGalleryFilterActions';
import { CurrentUserProvider } from './app/current-user';
import { PageTransitionFrame } from './app/PageTransitionFrame';
import { AppNavigationProvider, resolveNavKey, type AppNavigation } from './app/app-navigation';
import { GALLERY_SEARCH_EVENT, requestGallerySearch } from './app/gallery-search';
import { setBackgroundSessionActive, setCustomBackgroundUrl } from './theme/background';
import { userBackgroundApi } from './lib/user-background';
import { AlbumDetailScreen, GalleryScreen, getShareTokenFromPath, SettingsScreen, ShareManagementScreen, SharedAlbumApp } from './app/screens';

function AuthenticatedMomentPicApp() {
  const { systemConfig, fetchSystemConfig } = useSystemConfig();
  const {
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
    isAnyScanning,
    isLoading,
    isDirectoryAlbumsLoading,
    isRecentLoading,
    isScanning,
    isSmartAlbumsLoading,
    libraryRoots,
    loadAlbums,
    loadFavoriteAlbums,
    recentAlbums,
    refreshCurrentGallery,
    scan,
    scanError,
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
    handleLoadMore,
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
    setGalleryViewMode('home');
    void api.get('/albums', { page: nextFilters.page, pageSize: 1 });
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'home' });
  }, [navigate, resetToAlbumFilters, setGalleryViewMode, setIsAuthenticated]);

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

  const handleHomeClick = useCallback(() => {
    setActiveTab('gallery');
    setIsRecentActive(false);
    setGalleryViewMode('home');
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'home' });
  }, [navigate, setActiveTab, setGalleryViewMode, setIsRecentActive]);

  const handleResetFilters = useCallback(() => {
    handleKeywordChange('');
    handleSourceTypeChange('');
    handleSortByChange(galleryViewMode === 'smartAlbums' ? 'albumCount' : 'updatedAt');
    handleSortOrderChange('desc');
  }, [galleryViewMode, handleKeywordChange, handleSortByChange, handleSortOrderChange, handleSourceTypeChange]);

  const handleRecentClick = useCallback(() => {
    setActiveTab('gallery');
    setIsRecentActive(true);
    setGalleryViewMode('albums');
    resetToAlbumFilters();
    if (isRecentActive) void fetchRecentAlbums({ limit: 50 });
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: true, galleryViewMode: 'albums' });
  }, [fetchRecentAlbums, isRecentActive, navigate, resetToAlbumFilters, setActiveTab, setGalleryViewMode, setIsRecentActive]);

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
  // 侧栏「搜索相册」或快捷键 / ：先切到全部相册，再由工具栏聚焦搜索框
  useEffect(() => {
    if (!isAuthenticated) return;
    const onSearch = () => {
      const isListView = currentScreen === Screen.GALLERY && (galleryViewMode === 'albums' || galleryViewMode === 'favorites' || galleryViewMode === 'smartAlbums') && !isRecentActive;
      if (!isListView) handleSidebarNavigate('gallery');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (document.querySelector('.viewer-gallery')) return;
      event.preventDefault();
      requestGallerySearch();
    };
    window.addEventListener(GALLERY_SEARCH_EVENT, onSearch);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener(GALLERY_SEARCH_EVENT, onSearch);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [currentScreen, galleryViewMode, handleSidebarNavigate, isAuthenticated, isRecentActive]);

  // 背景图：登录后才加载自定义图片；同步一次服务器上的版本（换设备上传过也能拿到）
  useEffect(() => {
    setBackgroundSessionActive(isAuthenticated);
    if (!isAuthenticated) return;
    const controller = new AbortController();
    void userBackgroundApi.meta(controller.signal)
      .then((meta) => {
        if (!controller.signal.aborted) setCustomBackgroundUrl(meta?.url ?? null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [isAuthenticated]);

  const navScreen = currentScreen === Screen.SETTINGS
    ? 'settings'
    : currentScreen === Screen.SHARE_MANAGEMENT
      ? 'share'
      : currentScreen === Screen.SMART_ALBUM_DETAIL
        ? 'smart-album'
        : currentScreen === Screen.ALBUM_DETAIL
          ? 'album'
          : currentScreen === Screen.LOGIN
            ? 'login'
            : 'gallery';
  const appNavigation = useMemo<AppNavigation>(() => ({
    active: resolveNavKey({ screen: navScreen, galleryViewMode, isRecentActive, libraryRootId: filters.libraryRootId }),
    libraryRoots,
    albumCount: galleryViewMode === 'albums' && !isRecentActive && !filters.libraryRootId && !debouncedKeyword && !filters.sourceType
      ? (albums?.pagination.total ?? null)
      : null,
    isAnyScanning,
    isScanning,
    onHome: handleHomeClick,
    onAllAlbums: () => handleSidebarNavigate('gallery'),
    onFavorites: handleFavoritesClick,
    onRecent: handleRecentClick,
    onDirectory: handleDirectoryAlbumsClick,
    onSmart: handleSmartAlbumsClick,
    onShareManagement: handleShareManagementClick,
    onSettings: () => handleSidebarNavigate('settings'),
    onLibrary: handleLibraryRootChange,
    onScanAll: () => void handleRefreshAll(),
    onScanOne: (id: string) => void handleRefreshOne(id),
    onLogout: handleProfileClick,
  }), [
    albums?.pagination.total, debouncedKeyword, filters.libraryRootId, filters.sourceType, galleryViewMode, handleDirectoryAlbumsClick,
    handleFavoritesClick, handleHomeClick, handleLibraryRootChange, handleProfileClick, handleRecentClick, handleRefreshAll,
    handleRefreshOne, handleShareManagementClick, handleSidebarNavigate, handleSmartAlbumsClick, isAnyScanning, isRecentActive,
    isScanning, libraryRoots, navScreen,
  ]);

  const loadingFallback = (label: string) => (
    <div className="flex h-full w-full items-center justify-center text-on-surface-variant">{label}</div>
  );

  return (
    <CurrentUserProvider enabled={isAuthenticated}>
    <AppNavigationProvider value={appNavigation}>
    <div className="relative w-full h-[100dvh] overflow-hidden">
      <ThemeBackdrop />
      {isAuthenticated && scanError && currentScreen !== Screen.SETTINGS && <div role="alert" className="fixed left-4 right-4 top-4 z-50 rounded-xl bg-error px-4 py-3 text-on-error">{scanError}</div>}

      {isAuthBootstrapping ? (
        <div className="absolute inset-0 flex items-center justify-center text-on-surface-variant">
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
            <Suspense fallback={loadingFallback('正在加载图库...')}>
              <GalleryScreen
                displayMode={galleryViewMode}
                albums={galleryScreenModel.albums}
                isLoading={galleryScreenModel.isLoading}
                pagination={galleryScreenModel.pagination}
                onNavigateToAlbum={galleryViewMode === 'smartAlbums' ? handleNavigateToSmartAlbum : handleNavigateToAlbum}
                onNavigateToSmartAlbum={handleNavigateToSmartAlbum}
                onLoadMore={handleLoadMore}
                onSortByChange={handleSortByChange}
                onSortOrderChange={handleSortOrderChange}
                onSourceTypeChange={galleryScreenModel.canChangeSourceType ? handleSourceTypeChange : undefined}
                onResetFilters={handleResetFilters}
                currentSortBy={filters.sortBy}
                currentSortOrder={filters.sortOrder}
                currentSourceType={filters.sourceType}
                currentKeyword={filters.keyword}
                currentLibraryRootId={galleryScreenModel.currentLibraryRootId}
                headerTitle={galleryViewMode === 'albums' && !isRecentActive && filters.libraryRootId
                  ? libraryRoots.find((root) => root.id === filters.libraryRootId)?.name
                  : undefined}
                headerEyebrow={galleryViewMode === 'albums' && !isRecentActive && filters.libraryRootId ? 'Library' : undefined}
                headerDescription={galleryViewMode === 'albums' && !isRecentActive && filters.libraryRootId ? '这个图库里的全部图集' : undefined}
                onKeywordChange={handleKeywordChange}
                isRecentActive={galleryScreenModel.isRecentActive}
                scrollPosition={scrollPosition}
                onScrollPositionChange={setScrollPosition}
                onDirectoryNodeClick={handleDirectoryNodeClick}
                directoryBreadcrumbs={directoryAlbums?.breadcrumbs || []}
                onDirectoryBreadcrumbClick={handleDirectoryBreadcrumbClick}
                onAlbumFavoriteToggle={handleAlbumFavoriteToggle}
              />
            </Suspense>
          )}
          {currentScreen === Screen.ALBUM_DETAIL && (
            <Suspense fallback={loadingFallback('正在加载相册详情...')}>
              <AlbumDetailScreen
                mode="album"
                albumId={selectedAlbum || ''}
                onBack={handleBackToGallery}
                onRequestNextAlbum={nextAlbumId ? () => handleNavigateToAlbum(nextAlbumId) : undefined}
              />
            </Suspense>
          )}
          {currentScreen === Screen.SETTINGS && (
            <Suspense fallback={loadingFallback('正在加载设置...')}>
              <SettingsScreen
                scanError={scanError}
                onBack={handleBackToGallery}
                onScanComplete={refreshCurrentGallery}
                onSystemConfigChange={fetchSystemConfig}
              />
            </Suspense>
          )}
          {currentScreen === Screen.SHARE_MANAGEMENT && (
            <Suspense fallback={loadingFallback('正在加载分享管理...')}>
              <ShareManagementScreen onBack={handleBackToGallery} />
            </Suspense>
          )}
          {currentScreen === Screen.SMART_ALBUM_DETAIL && selectedSmartAlbum && (
            <Suspense fallback={loadingFallback('正在加载智能相册...')}>
              <GalleryScreen
                displayMode="albums"
                albums={smartAlbumMemberAlbums}
                isLoading={isSmartAlbumsLoading}
                pagination={null}
                onNavigateToAlbum={handleNavigateToAlbum}
                onSortByChange={handleSortByChange}
                onSortOrderChange={handleSortOrderChange}
                onSourceTypeChange={handleSourceTypeChange}
                currentSortBy={smartAlbumMemberSortBy}
                currentSortOrder={filters.sortOrder}
                currentSourceType={filters.sourceType}
                currentKeyword={filters.keyword}
                currentLibraryRootId=""
                onKeywordChange={handleKeywordChange}
                isRecentActive={false}
                scrollPosition={scrollPosition}
                onScrollPositionChange={setScrollPosition}
                headerEyebrow="Smart album"
                headerTitle={smartAlbumDetail?.name || '分类图集'}
                headerDescription={smartAlbumDetail
                  ? `共收纳 ${smartAlbumDetail.albumCount} 个图集`
                  : '正在加载分类图集...'}
                emptyTitle="这个智能相册下还没有图集"
                emptyDescription="请先重建智能相册，或者调整当前筛选条件。"
                onBack={handleBackToGallery}
                onAlbumFavoriteToggle={handleAlbumFavoriteToggle}
              />
            </Suspense>
          )}
        </PageTransitionFrame>
      )}
    </div>
    </AppNavigationProvider>
    </CurrentUserProvider>
  );
}

export default function App() {
  const shareToken = getShareTokenFromPath();
  if (shareToken) {
    return <SharedAlbumApp token={shareToken} />;
  }

  return <AuthenticatedMomentPicApp />;
}
