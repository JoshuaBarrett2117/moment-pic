import { useEffect, useState } from 'react';
import { Screen } from '../types';
import { api } from '../lib/api';
import { clearAuthSession, hasAuthSession } from './auth-session';
import { buildUrl, type GalleryFilters, type GalleryViewMode, type UrlNavigationState } from './gallery-navigation';

type GalleryTab = 'gallery' | 'settings';

type UseAppAuthBootstrapInput = {
  initialFilters: GalleryFilters;
  initialNavigation: UrlNavigationState;
  setActiveTab: (tab: GalleryTab) => void;
  setCurrentScreen: (screen: Screen) => void;
  setGalleryViewMode: (mode: GalleryViewMode) => void;
  setIsAuthenticated: (isAuthenticated: boolean) => void;
  setIsRecentActive: (isRecentActive: boolean) => void;
  setNextAlbumId: (albumId: string | null) => void;
  setSelectedAlbum: (albumId: string | null) => void;
  setSelectedSmartAlbum: (smartAlbumId: string | null) => void;
};

const resetToLoginScreen = (input: Pick<
  UseAppAuthBootstrapInput,
  | 'setActiveTab'
  | 'setCurrentScreen'
  | 'setGalleryViewMode'
  | 'setIsAuthenticated'
  | 'setIsRecentActive'
  | 'setNextAlbumId'
  | 'setSelectedAlbum'
  | 'setSelectedSmartAlbum'
>) => {
  clearAuthSession();
  input.setIsAuthenticated(false);
  input.setCurrentScreen(Screen.LOGIN);
  input.setActiveTab('gallery');
  input.setIsRecentActive(false);
  input.setGalleryViewMode('albums');
  input.setSelectedAlbum(null);
  input.setSelectedSmartAlbum(null);
  input.setNextAlbumId(null);
  window.history.replaceState(null, '', window.location.pathname);
};

const restoreInitialNavigation = (input: UseAppAuthBootstrapInput) => {
  input.setIsAuthenticated(true);
  input.setSelectedAlbum(input.initialNavigation.selectedAlbumId);
  input.setSelectedSmartAlbum(input.initialNavigation.selectedSmartAlbumId);
  input.setIsRecentActive(input.initialNavigation.isRecentActive);
  input.setGalleryViewMode(input.initialNavigation.galleryViewMode);
  input.setActiveTab(input.initialNavigation.screen === Screen.SETTINGS ? 'settings' : 'gallery');
  window.history.replaceState(
    {
      screen: input.initialNavigation.screen,
      selectedAlbum: input.initialNavigation.selectedAlbumId,
      selectedSmartAlbum: input.initialNavigation.selectedSmartAlbumId,
      activeTab: input.initialNavigation.screen === Screen.SETTINGS ? 'settings' : 'gallery',
      isRecentActive: input.initialNavigation.isRecentActive,
      galleryViewMode: input.initialNavigation.galleryViewMode,
    },
    '',
    buildUrl(input.initialFilters, {
      screen: input.initialNavigation.screen,
      selectedAlbumId: input.initialNavigation.selectedAlbumId,
      selectedSmartAlbumId: input.initialNavigation.selectedSmartAlbumId,
      isRecentActive: input.initialNavigation.isRecentActive,
      galleryViewMode: input.initialNavigation.galleryViewMode,
    })
  );
  input.setCurrentScreen(input.initialNavigation.screen);
};

export function useAppAuthBootstrap({
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
}: UseAppAuthBootstrapInput) {
  const [isAuthBootstrapping, setIsAuthBootstrapping] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const input = {
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
    };

    const verifyAuth = async () => {
      try {
        if (!hasAuthSession()) {
          resetToLoginScreen(input);
          return;
        }

        await api.get('/albums', { page: 1, pageSize: 1 });
        if (isMounted) {
          restoreInitialNavigation(input);
        }
      } catch {
        if (isMounted) {
          resetToLoginScreen(input);
        }
      } finally {
        if (isMounted) {
          setIsAuthBootstrapping(false);
        }
      }
    };

    void verifyAuth();

    return () => {
      isMounted = false;
    };
  }, [
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
  ]);

  return isAuthBootstrapping;
}
