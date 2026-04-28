import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Screen } from './types';
import { LoginScreen } from './components/LoginScreen';
import { PaperGrain } from './components/PaperGrain';
import { useAlbums, useLibraryRoots, useWebSocket, useLibraryScan, useRecentAlbums, recordAlbumView, useSmartAlbums } from './hooks';
import { api } from './lib/api';

const STORAGE_KEY = 'gallery_filters';
type GalleryViewMode = 'albums' | 'smartAlbums';

interface GalleryFilters {
  page: number;
  pageSize: number;
  keyword: string;
  sortBy: 'name' | 'updatedAt' | 'assetCount';
  sortOrder: 'asc' | 'desc';
  sourceType: '' | 'folder' | 'zip';
  libraryRootId: string;
}

interface UrlNavigationState {
  screen: Screen;
  selectedAlbumId: string | null;
  selectedSmartAlbumId: string | null;
  isRecentActive: boolean;
  galleryViewMode: GalleryViewMode;
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

const parseNavigationFromUrl = (): UrlNavigationState => {
  const params = new URLSearchParams(window.location.search);
  const screenParam = params.get('screen');
  const albumId = params.get('albumId');
  const smartAlbumId = params.get('smartAlbumId');
  const recent = params.get('recent');
  const view = params.get('view') === 'smart' ? 'smartAlbums' : 'albums';

  if (screenParam === 'album' && albumId) {
    return {
      screen: Screen.ALBUM_DETAIL,
      selectedAlbumId: albumId,
      selectedSmartAlbumId: null,
      isRecentActive: recent === '1',
      galleryViewMode: view,
    };
  }

  if (screenParam === 'smart-album' && smartAlbumId) {
    return {
      screen: Screen.SMART_ALBUM_DETAIL,
      selectedAlbumId: null,
      selectedSmartAlbumId: smartAlbumId,
      isRecentActive: false,
      galleryViewMode: 'smartAlbums',
    };
  }

  if (screenParam === 'settings') {
    return {
      screen: Screen.SETTINGS,
      selectedAlbumId: null,
      selectedSmartAlbumId: null,
      isRecentActive: false,
      galleryViewMode: view,
    };
  }

  return {
    screen: Screen.GALLERY,
    selectedAlbumId: null,
    selectedSmartAlbumId: null,
    isRecentActive: recent === '1',
    galleryViewMode: view,
  };
};

const buildUrl = (
  filters: GalleryFilters,
  navigation: { screen: Screen; selectedAlbumId?: string | null; selectedSmartAlbumId?: string | null; isRecentActive?: boolean; galleryViewMode?: GalleryViewMode }
) => {
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

  if (navigation.screen === Screen.ALBUM_DETAIL && navigation.selectedAlbumId) {
    params.set('screen', 'album');
    params.set('albumId', navigation.selectedAlbumId);
  } else if (navigation.screen === Screen.SMART_ALBUM_DETAIL && navigation.selectedSmartAlbumId) {
    params.set('screen', 'smart-album');
    params.set('smartAlbumId', navigation.selectedSmartAlbumId);
  } else if (navigation.screen === Screen.SETTINGS) {
    params.set('screen', 'settings');
  }

  if (navigation.galleryViewMode === 'smartAlbums') {
    params.set('view', 'smart');
  }

  if (navigation.isRecentActive) {
    params.set('recent', '1');
  }

  return params.toString() ? `?${params.toString()}` : window.location.pathname;
};

const syncFiltersToUrl = (filters: GalleryFilters, navigation: UrlNavigationState) => {
  const newUrl = buildUrl(filters, navigation);
  window.history.replaceState(window.history.state ?? null, '', newUrl);

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
const SmartAlbumGalleryScreen = lazy(() =>
  import('./components/SmartAlbumGalleryScreen').then((module) => ({
    default: module.SmartAlbumGalleryScreen
  }))
);
const SmartAlbumDetailScreen = lazy(() =>
  import('./components/SmartAlbumDetailScreen').then((module) => ({
    default: module.SmartAlbumDetailScreen
  }))
);

export default function App() {
  const initialFilters = getInitialFilters();
  const initialNavigation = parseNavigationFromUrl();
  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.LOGIN);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(initialNavigation.selectedAlbumId);
  const [selectedSmartAlbum, setSelectedSmartAlbum] = useState<string | null>(initialNavigation.selectedSmartAlbumId);
  const [nextAlbumId, setNextAlbumId] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);
  const [activeTab, setActiveTab] = useState<'gallery' | 'settings'>(initialNavigation.screen === Screen.SETTINGS ? 'settings' : 'gallery');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRecentActive, setIsRecentActive] = useState(initialNavigation.isRecentActive);
  const [galleryViewMode, setGalleryViewMode] = useState<GalleryViewMode>(initialNavigation.galleryViewMode);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [filters, setFilters] = useState<GalleryFilters>(initialFilters);
  const [debouncedKeyword, setDebouncedKeyword] = useState(initialFilters.keyword);

  const { albums, isLoading, error, fetchAlbums } = useAlbums();
  const {
    smartAlbums,
    isLoading: isSmartAlbumsLoading,
    fetchSmartAlbums
  } = useSmartAlbums();
  const { recentAlbums, isLoading: isRecentLoading, fetchRecentAlbums } = useRecentAlbums();
  const { libraryRoots, fetchLibraryRoots } = useLibraryRoots();
  const isRestoringHistoryRef = useRef(false);

  const syncHistory = useCallback(
    (
      screen: Screen,
      options: {
        replace?: boolean;
        selectedAlbumId?: string | null;
        selectedSmartAlbumId?: string | null;
        isRecentActive?: boolean;
        galleryViewMode?: GalleryViewMode;
      } = {}
    ) => {
      const nextUrl = buildUrl(filters, {
        screen,
        selectedAlbumId: options.selectedAlbumId ?? null,
        selectedSmartAlbumId: options.selectedSmartAlbumId ?? null,
        isRecentActive: screen === Screen.GALLERY || screen === Screen.ALBUM_DETAIL ? (options.isRecentActive ?? false) : false,
        galleryViewMode: options.galleryViewMode ?? galleryViewMode,
      });
      const state = {
        screen,
        selectedAlbum: options.selectedAlbumId ?? null,
        selectedSmartAlbum: options.selectedSmartAlbumId ?? null,
        activeTab: screen === Screen.SETTINGS ? 'settings' : 'gallery',
        isRecentActive:
          screen === Screen.GALLERY || screen === Screen.ALBUM_DETAIL
            ? (options.isRecentActive ?? false)
            : false,
        galleryViewMode: options.galleryViewMode ?? galleryViewMode,
      };

      const method = options.replace ? 'replaceState' : 'pushState';
      window.history[method](state, '', nextUrl);
    },
    [filters, galleryViewMode]
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

  const loadSmartAlbums = useCallback(() => {
    return fetchSmartAlbums({
      page: filters.page,
      pageSize: filters.pageSize,
      keyword: debouncedKeyword || undefined,
      sortBy: filters.sortBy === 'assetCount' ? 'assetCount' : filters.sortBy === 'name' ? 'name' : 'updatedAt',
      sortOrder: filters.sortOrder
    });
  }, [debouncedKeyword, fetchSmartAlbums, filters.page, filters.pageSize, filters.sortBy, filters.sortOrder]);

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
    const initialUrl = buildUrl(initialFilters, {
      screen: initialNavigation.screen,
      selectedAlbumId: initialNavigation.selectedAlbumId,
      isRecentActive: initialNavigation.isRecentActive,
    });
    window.history.replaceState(
      {
        screen: currentScreen,
        selectedAlbum: initialNavigation.selectedAlbumId,
        selectedSmartAlbum: initialNavigation.selectedSmartAlbumId,
        activeTab: initialNavigation.screen === Screen.SETTINGS ? 'settings' : 'gallery',
        isRecentActive: initialNavigation.isRecentActive,
        galleryViewMode: initialNavigation.galleryViewMode,
      },
      '',
      initialUrl
    );
  }, []);

  useEffect(() => {
    const verifyAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
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
          localStorage.removeItem('auth_token');
          setIsAuthenticated(false);
          setCurrentScreen(Screen.LOGIN);
          syncHistory(Screen.LOGIN, { replace: true });
        }
      }
    };
    verifyAuth();
  }, [initialNavigation.galleryViewMode, initialNavigation.isRecentActive, initialNavigation.screen, initialNavigation.selectedAlbumId, initialNavigation.selectedSmartAlbumId, syncHistory]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = (event.state || {}) as {
        screen?: Screen;
        selectedAlbum?: string | null;
        selectedSmartAlbum?: string | null;
        activeTab?: 'gallery' | 'settings';
        isRecentActive?: boolean;
        galleryViewMode?: GalleryViewMode;
      };

      const nextScreen = state.screen || (isAuthenticated ? Screen.GALLERY : Screen.LOGIN);
      isRestoringHistoryRef.current = true;
      setCurrentScreen(nextScreen);
      setSelectedAlbum(state.selectedAlbum ?? null);
      setSelectedSmartAlbum(state.selectedSmartAlbum ?? null);
      setNextAlbumId(null);
      setActiveTab(state.activeTab || 'gallery');
      setIsRecentActive(Boolean(state.isRecentActive));
      setGalleryViewMode(state.galleryViewMode ?? 'albums');

      if (nextScreen !== Screen.ALBUM_DETAIL) {
        setSelectedAlbum(null);
      }
      if (nextScreen !== Screen.SMART_ALBUM_DETAIL) {
        setSelectedSmartAlbum(null);
      }

      queueMicrotask(() => {
        isRestoringHistoryRef.current = false;
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAuthenticated]);

  useEffect(() => {
    if (currentScreen === Screen.GALLERY && isAuthenticated) {
      fetchLibraryRoots();
    }
  }, [currentScreen, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && currentScreen === Screen.GALLERY) {
      if (galleryViewMode === 'smartAlbums') {
        loadSmartAlbums();
        return;
      }
      loadAlbums();
    }
  }, [isAuthenticated, currentScreen, loadAlbums, loadSmartAlbums, galleryViewMode]);

  useEffect(() => {
    if (currentScreen === Screen.GALLERY && isAuthenticated) {
      syncFiltersToUrl(filters, {
        screen: Screen.GALLERY,
        selectedAlbumId: null,
        selectedSmartAlbumId: null,
        isRecentActive,
        galleryViewMode,
      });
    }
  }, [filters, currentScreen, isAuthenticated, isRecentActive, galleryViewMode]);

  useEffect(() => {
    if (!isAuthenticated || !isAnyScanning) {
      return;
    }

    if (wsConnected) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (galleryViewMode === 'smartAlbums') {
        loadSmartAlbums();
        return;
      }
      loadAlbums();
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isAuthenticated, isAnyScanning, wsConnected, galleryViewMode, loadAlbums, loadSmartAlbums]);

  const navigate = (
    screen: Screen,
    dir: number = 1,
    options: { selectedAlbumId?: string | null; selectedSmartAlbumId?: string | null; replace?: boolean; isRecentActive?: boolean; galleryViewMode?: GalleryViewMode } = {}
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
    setGalleryViewMode('albums');
    fetchAlbums({
      page: nextFilters.page,
      pageSize: nextFilters.pageSize,
      keyword: nextFilters.keyword || undefined,
      sortBy: nextFilters.sortBy,
      sortOrder: nextFilters.sortOrder,
      sourceType: nextFilters.sourceType || undefined,
      libraryRootId: undefined,
    });
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'albums' });
  };

  const handleNavigateToAlbum = (albumId: string) => {
    const sourceAlbums = isRecentActive ? (recentAlbums || []) : (albums?.items || []);
    const currentIndex = sourceAlbums.findIndex((album) => album.id === albumId);
    const nextId = currentIndex >= 0 ? sourceAlbums[currentIndex + 1]?.id ?? null : null;

    setSelectedAlbum(albumId);
    setNextAlbumId(nextId);
    recordAlbumView(albumId);
    navigate(Screen.ALBUM_DETAIL, 1, { selectedAlbumId: albumId, isRecentActive, galleryViewMode });
  };

  const handleNavigateToSmartAlbum = (smartAlbumId: string) => {
    setSelectedSmartAlbum(smartAlbumId);
    navigate(Screen.SMART_ALBUM_DETAIL, 1, { selectedSmartAlbumId: smartAlbumId, galleryViewMode: 'smartAlbums' });
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
    setIsRecentActive(false);
    setNextAlbumId(null);
    setSelectedAlbum(null);
    if (currentScreen === Screen.SMART_ALBUM_DETAIL) {
      navigate(Screen.GALLERY, -1, { replace: true, isRecentActive: false, galleryViewMode: 'smartAlbums' });
      return;
    }
    navigate(Screen.GALLERY, -1, { replace: true, isRecentActive: false, galleryViewMode });
  };

  const handleSidebarNavigate = (tab: 'gallery' | 'settings') => {
    setActiveTab(tab);
    setIsRecentActive(false);
    if (tab === 'gallery') {
      const nextFilters = { ...filters, libraryRootId: '', page: 1 };
      setFilters(nextFilters);
      setScrollPosition(0);
      setGalleryViewMode('albums');
      fetchAlbums({
        page: nextFilters.page,
        pageSize: nextFilters.pageSize,
        keyword: nextFilters.keyword || undefined,
        sortBy: nextFilters.sortBy,
        sortOrder: nextFilters.sortOrder,
        sourceType: nextFilters.sourceType || undefined,
        libraryRootId: undefined,
      });
      navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'albums' });
    } else if (tab === 'settings') {
      navigate(Screen.SETTINGS, 1);
    }
  };

  const handleRecentClick = () => {
    setActiveTab('gallery');
    setIsRecentActive(true);
    setGalleryViewMode('albums');
    setFilters(prev => ({ ...prev, libraryRootId: '', page: 1 }));
    setScrollPosition(0);
    fetchRecentAlbums({ limit: 50 });
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: true, galleryViewMode: 'albums' });
  };

  const handleSmartAlbumsClick = () => {
    setActiveTab('gallery');
    setIsRecentActive(false);
    setGalleryViewMode('smartAlbums');
    setFilters(prev => ({ ...prev, libraryRootId: '', page: 1 }));
    setScrollPosition(0);
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'smartAlbums' });
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
    const nextFilters = { ...filters, libraryRootId, page: 1 };
    setIsRecentActive(false);
    setGalleryViewMode('albums');
    setFilters(nextFilters);
    setScrollPosition(0);
    setActiveTab('gallery');
    fetchAlbums({
      page: nextFilters.page,
      pageSize: nextFilters.pageSize,
      keyword: nextFilters.keyword || undefined,
      sortBy: nextFilters.sortBy,
      sortOrder: nextFilters.sortOrder,
      sourceType: nextFilters.sourceType || undefined,
      libraryRootId: nextFilters.libraryRootId || undefined,
    });
    navigate(Screen.GALLERY, 1, { replace: true, isRecentActive: false, galleryViewMode: 'albums' });
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
              {galleryViewMode === 'smartAlbums' ? (
                <SmartAlbumGalleryScreen
                  smartAlbums={smartAlbums?.items || []}
                  isLoading={isSmartAlbumsLoading}
                  pagination={smartAlbums?.pagination || null}
                  libraryRoots={libraryRoots}
                  onLibraryRootChange={handleLibraryRootChange}
                  activeTab={activeTab}
                  onSidebarNavigate={handleSidebarNavigate}
                  onScanAll={handleRefreshAll}
                  onScanOne={handleRefreshOne}
                  isAnyScanning={isAnyScanning}
                  isScanning={isScanning}
                  onRecentClick={handleRecentClick}
                  onSmartAlbumsClick={handleSmartAlbumsClick}
                  onProfileClick={handleProfileClick}
                  onNavigateToSmartAlbum={handleNavigateToSmartAlbum}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                  onKeywordChange={handleKeywordChange}
                  onSortByChange={(sortBy) => handleSortByChange(sortBy as 'name' | 'updatedAt' | 'assetCount')}
                  onSortOrderChange={handleSortOrderChange}
                  currentPageSize={filters.pageSize}
                  currentKeyword={filters.keyword}
                  currentSortBy={filters.sortBy as 'name' | 'updatedAt' | 'albumCount' | 'assetCount'}
                  currentSortOrder={filters.sortOrder}
                />
              ) : (
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
                  onSmartAlbumsClick={handleSmartAlbumsClick}
                  isSmartAlbumsActive={false}
                />
              )}
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
              <SmartAlbumDetailScreen
                smartAlbumId={selectedSmartAlbum}
                onBack={handleBackToGallery}
                onNavigateToAlbum={handleNavigateToAlbum}
              />
            </Suspense>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
