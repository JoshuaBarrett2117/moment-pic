import { createContext, useContext, type ReactNode } from 'react';
import type { LibraryRootDTO } from '../types/api';

/** 侧栏 / 底部标签栏当前高亮的入口。 */
export type NavKey =
  | 'home'
  | 'albums'
  | 'favorites'
  | 'recent'
  | 'directory'
  | 'smart'
  | 'share'
  | 'settings'
  | `library:${string}`
  | 'none';

export type AppNavigation = {
  active: NavKey;
  libraryRoots: LibraryRootDTO[];
  albumCount: number | null;
  isAnyScanning: boolean;
  isScanning: (libraryRootId: string) => boolean;
  onHome: () => void;
  onAllAlbums: () => void;
  onFavorites: () => void;
  onRecent: () => void;
  onDirectory: () => void;
  onSmart: () => void;
  onShareManagement: () => void;
  onSettings: () => void;
  onLibrary: (libraryRootId: string) => void;
  onScanAll: () => void;
  onScanOne: (libraryRootId: string) => void;
  onLogout: () => void;
};

const noop = () => {};

export const defaultAppNavigation: AppNavigation = {
  active: 'none',
  libraryRoots: [],
  albumCount: null,
  isAnyScanning: false,
  isScanning: () => false,
  onHome: noop,
  onAllAlbums: noop,
  onFavorites: noop,
  onRecent: noop,
  onDirectory: noop,
  onSmart: noop,
  onShareManagement: noop,
  onSettings: noop,
  onLibrary: noop,
  onScanAll: noop,
  onScanOne: noop,
  onLogout: noop,
};

const AppNavigationContext = createContext<AppNavigation>(defaultAppNavigation);

export const AppNavigationProvider = ({ value, children }: { value: AppNavigation; children: ReactNode }) => (
  <AppNavigationContext.Provider value={value}>{children}</AppNavigationContext.Provider>
);

export const useAppNavigation = () => useContext(AppNavigationContext);

/** 根据当前视图计算高亮入口。 */
export const resolveNavKey = (input: {
  screen: 'gallery' | 'smart-album' | 'album' | 'settings' | 'share' | 'login';
  galleryViewMode: 'home' | 'albums' | 'smartAlbums' | 'directoryAlbums' | 'favorites';
  isRecentActive: boolean;
  libraryRootId: string;
}): NavKey => {
  if (input.screen === 'settings') return 'settings';
  if (input.screen === 'share') return 'share';
  if (input.screen === 'smart-album') return 'smart';
  if (input.screen === 'login') return 'none';
  switch (input.galleryViewMode) {
    case 'home': return 'home';
    case 'favorites': return 'favorites';
    case 'directoryAlbums': return 'directory';
    case 'smartAlbums': return 'smart';
    default:
      if (input.isRecentActive) return 'recent';
      if (input.libraryRootId) return `library:${input.libraryRootId}`;
      return 'albums';
  }
};
