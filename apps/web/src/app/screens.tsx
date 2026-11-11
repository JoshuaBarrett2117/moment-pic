import { lazy, Suspense } from 'react';

import { ThemeBackdrop } from '../components/ThemeBackdrop';

/** 按需加载的页面级组件（代码分割）与公开分享入口。 */

export const GalleryScreen = lazy(() =>
  import('../components/GalleryScreen').then((module) => ({
    default: module.GalleryScreen
  }))
);
export const AlbumDetailScreen = lazy(() =>
  import('../components/AlbumDetailScreen').then((module) => ({
    default: module.AlbumDetailScreen
  }))
);
export const SettingsScreen = lazy(() =>
  import('../components/SettingsScreen').then((module) => ({
    default: module.SettingsScreen
  }))
);
export const ShareManagementScreen = lazy(() =>
  import('../components/ShareManagementScreen').then((module) => ({
    default: module.ShareManagementScreen
  }))
);
const SharedAlbumScreen = lazy(() =>
  import('../components/SharedAlbumScreen').then((module) => ({
    default: module.SharedAlbumScreen
  }))
);

export const getShareTokenFromPath = (): string => {
  if (!window.location.pathname.startsWith('/share/')) {
    return '';
  }

  return decodeURIComponent(window.location.pathname.slice('/share/'.length));
};

export const SharedAlbumApp = ({ token }: { token: string }) => (
  <div className="relative w-full h-[100dvh] overflow-hidden">
    <ThemeBackdrop />
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
