import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Screen } from './types';
import { LoginScreen } from './components/LoginScreen';
import { PaperGrain } from './components/PaperGrain';
import { useAlbums, useLibraryRoots, useWebSocket, useLibraryScan, useRecentAlbums, recordAlbumView } from './hooks';
import { api } from './lib/api';

const STORAGE_KEY = 'gallery_filters';

interface GalleryFilters {
  page: number;
  pageSize: number;
  keyword: string;
  sortBy: 'name' | 'updatedAt' | 'assetCount';
  sortOrder: 'asc' | 'desc';
  sourceType: '' | 'folder' | 'zip';
  libraryRootId: string;
}

const parseFiltersFromUrl = (): Partial<GalleryFilters> => {
  const params = new URLSearchParams(window.location.search);
  const result: Partial<GalleryFilters> = {};

  const page = params.get('page');
  if (page && !isNaN(Number(page))) {
    result.page = Math.max(1, Number(page));
  }

  const pageSize = params.get('pageSize');
  if (pageSize && !isNaN(Number(pageSize))) {
    result.pageSize = Number(pageSize);
  }

  const keyword = params.get('keyword');
  if (keyword) {
    result.keyword = keyword;
  }

  const sortBy = params.get('sortBy');
  if (sortBy === 'name' || sortBy === 'updatedAt' || sortBy === 'assetCount') {
    result.sortBy = sortBy;
  }

  const sortOrder = params.get('sortOrder');
  if (sortOrder === 'asc' || sortOrder === 'desc') {
    result.sortOrder = sortOrder;
  }

  const sourceType = params.get('sourceType');
  if (sourceType === '' || sourceType === 'folder' || sourceType === 'zip') {
    result.sourceType = sourceType;
  }

  const libraryRootId = params.get('libraryRootId');
  if (libraryRootId) {
    result.libraryRootId = libraryRootId;
  }

  return result;
};

const syncFiltersToUrl = (filters: GalleryFilters) => {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  if (filters.keyword) {
    params.set('keyword', filters.keyword);
  }
  if (filters.sortBy !== 'updatedAt') {
    params.set('sortBy', filters.sortBy);
  }
  if (filters.sortOrder !== 'desc') {
    params.set('sortOrder', filters.sortOrder);
  }
  if (filters.sourceType) {
    params.set('sourceType', filters.sourceType);
  }
  if (filters.libraryRootId) {
    params.set('libraryRootId', filters.libraryRootId);
  }

  const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
  window.history.replaceState({}, '', newUrl);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
  }
};

const getInitialFilters = (): GalleryFilters => {
  const urlFilters = parseFiltersFromUrl();
  return {
    page: urlFilters.page || 1,
    pageSize: urlFilters.pageSize || 24,
    keyword: urlFilters.keyword || '',
    sortBy: urlFilters.sortBy || 'updatedAt',
    sortOrder: urlFilters.sortOrder || 'desc',
    sourceType: urlFilters.sourceType || '',
    libraryRootId: urlFilters.libraryRootId || '',
  };
};

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
  const initialFilters = getInitialFilters();
  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.LOGIN);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [nextAlbumId, setNextAlbumId] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);
  const [activeTab, setActiveTab] = useState<'gallery' | 'settings'>('gallery');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRecentActive, setIsRecentActive] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [filters, setFilters] = useState<GalleryFilters>(initialFilters);
  const [debouncedKeyword, setDebouncedKeyword] = useState(initialFilters.keyword);

  const { albums, isLoading, error, fetchAlbums } = useAlbums();
  const { recentAlbums, isLoading: isRecentLoading, fetchRecentAlbums } = useRecentAlbums();
  const { libraryRoots, fetchLibraryRoots } = useLibraryRoots();
  const isRestoringHistoryRef = useRef(false);

  const syncHistory = useCallback(
    (
      screen: Screen,
      options: { replace?: boolean; selectedAlbumId?: string | null; isRecentActive?: boolean } = {}
    ) => {
      const state = {
        screen,
        selectedAlbum: options.selectedAlbumId ?? null,
        activeTab: screen === Screen.SETTINGS ? 'settings' : 'gallery',
        isRecentActive: screen === Screen.GALLERY ? (options.isRecentActive ?? false) : false,
      };

      const method = options.replace ? 'replaceState' : 'pushState';
      window.history[method](state, '', window.location.href);
    },
    []
  );

  const loadAlbums = useCallback(() => {
    return fetchAlbums({
      page: filters.page,
      pageSize: filters.pageSize,
      keyword: debouncedKeyword || undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      sourceType: filters.sourceType || undefined,
      libraryRootId: filters.libraryRootId || undefined,
    });
  }, [fetchAlbums, filters.page, filters.pageSize, filters.sortBy, filters.sortOrder, filters.sourceType, filters.libraryRootId, debouncedKeyword]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(filters.keyword);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [filters]);

  const refreshCurrentGallery = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    await fetchLibraryRoots();
    if (isRecentActive) {
      await fetchRecentAlbums({ limit: 50 });
      return;
    }

    await loadAlbums();
  }, [fetchLibraryRoots, fetchRecentAlbums, isAuthenticated, isRecentActive, loadAlbums]);

  const { isScanning, scan, scanningLibraryRootIds, isAnyScanning } = useLibraryScan({
    onScanComplete: refreshCurrentGallery
  });
  const scanningLibraryRootId = scanningLibraryRootIds.size > 0 ? Array.from(scanningLibraryRootIds)[0] : null;

  const { isConnected: wsConnected } = useWebSocket(
    (event) => {
      if (event.type !== 'unlink') {
        return;
      }

      if (!isAuthenticated) {
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
    (event) => {
      console.log('[App] Scan complete from WS:', event);
      void refreshCurrentGallery();
    }
  );

  useEffect(() => {
    window.history.replaceState(
      {
        screen: currentScreen,
        selectedAlbum: null,
        activeTab: 'gallery',
        isRecentActive: false,
      },
      '',
      window.location.href
    );
  }, []);

  useEffect(() => {
    const verifyAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        try {
          await api.get('/albums', { page: 1, pageSize: 1 });
          setIsAuthenticated(true);
          syncHistory(Screen.GALLERY, { replace: true, isRecentActive: false });
          setCurrentScreen(Screen.GALLERY);
        } catch {
          localStorage.removeItem('auth_token');
          setIsAuthenticated(false);
          setCurrentScreen(Screen.LOGIN);
          syncHistory(Screen.LOGIN, { replace: true });
        }
      }
    };
    verifyAuth();
  }, [syncHistory]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = (event.state || {}) as {
        screen?: Screen;
        selectedAlbum?: string | null;
        activeTab?: 'gallery' | 'settings';
        isRecentActive?: boolean;
      };

      const nextScreen = state.screen || Screen.LOGIN;
      isRestoringHistoryRef.current = true;
      setCurrentScreen(nextScreen);
      setSelectedAlbum(state.selectedAlbum ?? null);
      setNextAlbumId(null);
      setActiveTab(state.activeTab || 'gallery');
      setIsRecentActive(Boolean(state.isRecentActive));

      if (nextScreen !== Screen.ALBUM_DETAIL) {
        setSelectedAlbum(null);
      }

      queueMicrotask(() => {
        isRestoringHistoryRef.current = false;
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (currentScreen === Screen.GALLERY && isAuthenticated) {
      fetchLibraryRoots();
    }
  }, [currentScreen, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && currentScreen === Screen.GALLERY) {
      loadAlbums();
    }
  }, [isAuthenticated, currentScreen, loadAlbums]);

  useEffect(() => {
    if (currentScreen === Screen.GALLERY && isAuthenticated) {
      syncFiltersToUrl(filters);
    }
  }, [filters, currentScreen, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !isAnyScanning) {
      return;
    }

    if (wsConnected) {
      return;
    }

    const intervalId = window.setInterval(() => {
      loadAlbums();
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isAuthenticated, isAnyScanning, wsConnected, loadAlbums]);

  const navigate = (
    screen: Screen,
    dir: number = 1,
    options: { selectedAlbumId?: string | null; replace?: boolean; isRecentActive?: boolean } = {}
  ) => {
    setDirection(dir);
    if (!isRestoringHistoryRef.current) {
      syncHistory(screen, options);
    }
    setCurrentScreen(screen);
  };

  const handleLogin = () => {
    const nextFilters = { ...filters, libraryRootId: '', page: 1 };
    setIsAuthenticated(true);
    localStorage.setItem('auth_token', 'authenticated');
    setFilters(nextFilters);
    fetchAlbums({
      page: nextFilters.page,
      pageSize: nextFilters.pageSize,
      keyword: nextFilters.keyword || undefined,
      sortBy: nextFilters.sortBy,
      sortOrder: nextFilters.sortOrder,
      sourceType: nextFilters.sourceType || undefined,
      libraryRootId: undefined,
    });
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false });
  };

  const handleNavigateToAlbum = (albumId: string) => {
    const sourceAlbums = isRecentActive ? (recentAlbums || []) : (albums?.items || []);
    const currentIndex = sourceAlbums.findIndex((album) => album.id === albumId);
    const nextId = currentIndex >= 0 ? sourceAlbums[currentIndex + 1]?.id ?? null : null;

    setSelectedAlbum(albumId);
    setNextAlbumId(nextId);
    recordAlbumView(albumId);
    navigate(Screen.ALBUM_DETAIL, 1, { selectedAlbumId: albumId, isRecentActive });
  };

  const handleProfileClick = () => {
    localStorage.removeItem('auth_token');
    setIsAuthenticated(false);
    setNextAlbumId(null);
    navigate(Screen.LOGIN, -1);
  };

  const handleBackToGallery = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    setActiveTab('gallery');
    setNextAlbumId(null);
    fetchAlbums({
      page: filters.page,
      pageSize: filters.pageSize,
      keyword: filters.keyword || undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      sourceType: filters.sourceType || undefined,
      libraryRootId: filters.libraryRootId || undefined,
    });
    navigate(Screen.GALLERY, -1, { replace: true, isRecentActive: false });
  };

  const handleSidebarNavigate = (tab: 'gallery' | 'settings') => {
    setActiveTab(tab);
    setIsRecentActive(false);
    if (tab === 'gallery') {
      const nextFilters = { ...filters, libraryRootId: '', page: 1 };
      setFilters(nextFilters);
      setScrollPosition(0);
      fetchAlbums({
        page: nextFilters.page,
        pageSize: nextFilters.pageSize,
        keyword: nextFilters.keyword || undefined,
        sortBy: nextFilters.sortBy,
        sortOrder: nextFilters.sortOrder,
        sourceType: nextFilters.sourceType || undefined,
        libraryRootId: undefined,
      });
      navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false });
    } else if (tab === 'settings') {
      navigate(Screen.SETTINGS, 1);
    }
  };

  const handleRecentClick = () => {
    setIsRecentActive(true);
    setFilters(prev => ({ ...prev, libraryRootId: '', page: 1 }));
    setScrollPosition(0);
    fetchRecentAlbums({ limit: 50 });
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: true });
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
    setScrollPosition(0);
  };

  const handleSortByChange = (sortBy: 'name' | 'updatedAt' | 'assetCount') => {
    setFilters(prev => ({ ...prev, sortBy, page: 1 }));
    setScrollPosition(0);
  };

  const handleSortOrderChange = (sortOrder: 'asc' | 'desc') => {
    setFilters(prev => ({ ...prev, sortOrder }));
    setScrollPosition(0);
  };

  const handlePageSizeChange = (pageSize: number) => {
    setFilters(prev => ({ ...prev, pageSize, page: 1 }));
    setScrollPosition(0);
  };

  const handleKeywordChange = (keyword: string) => {
    setFilters(prev => ({ ...prev, keyword, page: 1 }));
    setScrollPosition(0);
  };

  const handleSourceTypeChange = (sourceType: '' | 'folder' | 'zip') => {
    setFilters(prev => ({ ...prev, sourceType, page: 1 }));
    setScrollPosition(0);
  };

  const handleLibraryRootChange = (libraryRootId: string) => {
    setIsRecentActive(false);
    setFilters(prev => ({ ...prev, libraryRootId, page: 1 }));
    setScrollPosition(0);
  };

  const handleRefreshAll = async () => {
    await scan();
  };

  const handleRefreshOne = async (libraryRootId: string) => {
    await scan(libraryRootId);
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      x: direction < 0 ? '100%' : '-100%',
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
                albums={isRecentActive ? (recentAlbums || []) : (albums?.items || [])}
                isLoading={isRecentActive ? isRecentLoading : isLoading}
                pagination={isRecentActive ? null : (albums?.pagination || null)}
                onNavigateToAlbum={handleNavigateToAlbum}
                onProfileClick={handleProfileClick}
                onRefresh={isRecentActive ? handleRecentClick : loadAlbums}
                onPageChange={handlePageChange}
                onSortByChange={handleSortByChange}
                onSortOrderChange={handleSortOrderChange}
                onPageSizeChange={handlePageSizeChange}
                onSourceTypeChange={handleSourceTypeChange}
                currentSortBy={filters.sortBy}
                currentSortOrder={filters.sortOrder}
                currentPageSize={filters.pageSize}
                currentSourceType={filters.sourceType}
                currentKeyword={filters.keyword}
                activeTab={activeTab}
                onSidebarNavigate={handleSidebarNavigate}
                libraryRoots={libraryRoots}
                currentLibraryRootId={filters.libraryRootId}
                onLibraryRootChange={handleLibraryRootChange}
                onKeywordChange={handleKeywordChange}
                onScanAll={handleRefreshAll}
                onScanOne={handleRefreshOne}
                isAnyScanning={isAnyScanning}
                isScanning={isScanning}
                scanningLibraryRootId={scanningLibraryRootId}
                onAlbumDeleted={loadAlbums}
                onRecentClick={handleRecentClick}
                isRecentActive={isRecentActive}
                scrollPosition={scrollPosition}
                onScrollPositionChange={setScrollPosition}
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
                albumId={selectedAlbum || ''} 
                onBack={handleBackToGallery}
                onAssetDeleted={loadAlbums}
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
