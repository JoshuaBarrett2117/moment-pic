import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Screen } from '../types';

const STORAGE_KEY = 'gallery_filters';

export type GalleryViewMode = 'albums' | 'smartAlbums' | 'directoryAlbums';
export type GallerySortBy = 'name' | 'updatedAt' | 'assetCount' | 'albumCount';

export interface GalleryFilters {
  page: number;
  pageSize: number;
  keyword: string;
  sortBy: GallerySortBy;
  sortOrder: 'asc' | 'desc';
  sourceType: '' | 'folder' | 'zip';
  libraryRootId: string;
  directoryLibraryRootId: string;
  directoryRelativePath: string;
}

export interface UrlNavigationState {
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
  if (page && !Number.isNaN(Number(page))) {
    result.page = Math.max(1, Number(page));
  }

  const pageSize = params.get('pageSize');
  if (pageSize && !Number.isNaN(Number(pageSize))) {
    result.pageSize = Number(pageSize);
  }

  const keyword = params.get('keyword');
  if (keyword) {
    result.keyword = keyword;
  }

  const sortBy = params.get('sortBy');
  if (sortBy === 'name' || sortBy === 'updatedAt' || sortBy === 'assetCount' || sortBy === 'albumCount') {
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

export const parseNavigationFromUrl = (): UrlNavigationState => {
  const params = new URLSearchParams(window.location.search);
  const screenParam = params.get('screen');
  const albumId = params.get('albumId');
  const smartAlbumId = params.get('smartAlbumId');
  const recent = params.get('recent');
  const viewParam = params.get('view');
  const view = viewParam === 'smart'
    ? 'smartAlbums'
    : viewParam === 'directory'
      ? 'directoryAlbums'
      : 'albums';

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

export const buildUrl = (
  filters: GalleryFilters,
  navigation: {
    screen: Screen;
    selectedAlbumId?: string | null;
    selectedSmartAlbumId?: string | null;
    isRecentActive?: boolean;
    galleryViewMode?: GalleryViewMode;
  }
) => {
  if (navigation.screen === Screen.LOGIN) {
    return window.location.pathname;
  }

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
  if (navigation.galleryViewMode === 'directoryAlbums' && filters.directoryLibraryRootId) {
    params.set('directoryLibraryRootId', filters.directoryLibraryRootId);
  }
  if (navigation.galleryViewMode === 'directoryAlbums' && filters.directoryRelativePath) {
    params.set('directoryRelativePath', filters.directoryRelativePath);
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
  if (navigation.galleryViewMode === 'directoryAlbums') {
    params.set('view', 'directory');
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
    // ignore storage errors
  }
};

const getInitialFilters = (initialViewMode: GalleryViewMode): GalleryFilters => {
  const urlFilters = parseFiltersFromUrl();
  const defaultSortBy: GallerySortBy = initialViewMode === 'smartAlbums' ? 'albumCount' : 'updatedAt';
  return {
    page: urlFilters.page || 1,
    pageSize: urlFilters.pageSize || 24,
    keyword: urlFilters.keyword || '',
    sortBy: urlFilters.sortBy || defaultSortBy,
    sortOrder: urlFilters.sortOrder || 'desc',
    sourceType: urlFilters.sourceType || '',
    libraryRootId: urlFilters.libraryRootId || '',
    directoryLibraryRootId: parseFiltersFromUrlParams('directoryLibraryRootId'),
    directoryRelativePath: parseFiltersFromUrlParams('directoryRelativePath'),
  };
};

const parseFiltersFromUrlParams = (key: string): string => {
  const params = new URLSearchParams(window.location.search);
  return params.get(key) || '';
};

export const useGalleryAppState = () => {
  const initialNavigation = useMemo(() => parseNavigationFromUrl(), []);
  const initialFilters = useMemo(
    () => getInitialFilters(initialNavigation.galleryViewMode),
    [initialNavigation.galleryViewMode]
  );

  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.LOGIN);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(initialNavigation.selectedAlbumId);
  const [selectedSmartAlbum, setSelectedSmartAlbum] = useState<string | null>(initialNavigation.selectedSmartAlbumId);
  const [nextAlbumId, setNextAlbumId] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);
  const [activeTab, setActiveTab] = useState<'gallery' | 'settings'>(
    initialNavigation.screen === Screen.SETTINGS ? 'settings' : 'gallery'
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRecentActive, setIsRecentActive] = useState(initialNavigation.isRecentActive);
  const [galleryViewMode, setGalleryViewMode] = useState<GalleryViewMode>(initialNavigation.galleryViewMode);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [filters, setFilters] = useState<GalleryFilters>(initialFilters);
  const [debouncedKeyword, setDebouncedKeyword] = useState(initialFilters.keyword);
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

  const resetToLogin = useCallback(() => {
    localStorage.removeItem('auth_token');
    setIsAuthenticated(false);
    setCurrentScreen(Screen.LOGIN);
    setActiveTab('gallery');
    setIsRecentActive(false);
    setGalleryViewMode('albums');
    setSelectedAlbum(null);
    setSelectedSmartAlbum(null);
    setNextAlbumId(null);
    syncHistory(Screen.LOGIN, { replace: true, isRecentActive: false, galleryViewMode: 'albums' });
  }, [syncHistory]);

  const navigate = useCallback(
    (
      screen: Screen,
      dir: number = 1,
      options: {
        selectedAlbumId?: string | null;
        selectedSmartAlbumId?: string | null;
        replace?: boolean;
        isRecentActive?: boolean;
        galleryViewMode?: GalleryViewMode;
      } = {}
    ) => {
      setDirection(dir);
      if (!isRestoringHistoryRef.current) {
        syncHistory(screen, options);
      }
      setCurrentScreen(screen);
    },
    [syncHistory]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(filters.keyword);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [filters]);

  useEffect(() => {
    const hasToken = Boolean(localStorage.getItem('auth_token'));
    const initialScreen = hasToken ? initialNavigation.screen : Screen.LOGIN;
    const initialUrl = hasToken
      ? buildUrl(initialFilters, {
          screen: initialNavigation.screen,
          selectedAlbumId: initialNavigation.selectedAlbumId,
          selectedSmartAlbumId: initialNavigation.selectedSmartAlbumId,
          isRecentActive: initialNavigation.isRecentActive,
          galleryViewMode: initialNavigation.galleryViewMode,
        })
      : window.location.pathname;

    window.history.replaceState(
      {
        screen: initialScreen,
        selectedAlbum: hasToken ? initialNavigation.selectedAlbumId : null,
        selectedSmartAlbum: hasToken ? initialNavigation.selectedSmartAlbumId : null,
        activeTab: hasToken && initialNavigation.screen === Screen.SETTINGS ? 'settings' : 'gallery',
        isRecentActive: hasToken ? initialNavigation.isRecentActive : false,
        galleryViewMode: hasToken ? initialNavigation.galleryViewMode : 'albums',
      },
      '',
      initialUrl
    );
  }, [initialFilters, initialNavigation]);

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
    const handleAuthExpired = () => {
      resetToLogin();
    };

    window.addEventListener('moment-pic-auth-expired', handleAuthExpired);
    return () => window.removeEventListener('moment-pic-auth-expired', handleAuthExpired);
  }, [resetToLogin]);

  return {
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
    resetToLogin,
    scrollPosition,
    selectedAlbum,
    selectedSmartAlbum,
    setActiveTab,
    setCurrentScreen,
    setDebouncedKeyword,
    setDirection,
    setFilters,
    setGalleryViewMode,
    setIsAuthenticated,
    setIsRecentActive,
    setNextAlbumId,
    setScrollPosition,
    setSelectedAlbum,
    setSelectedSmartAlbum,
    syncHistory,
  };
};
