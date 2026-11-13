import { AnimatePresence, m } from 'motion/react';
import {
  Clock, FolderTree, HardDrive, Home, Images, Layers3, Loader2, LogOut, RefreshCw, Search, Settings, Share2, Star, UserRound, X,
} from 'lucide-react';
import { type FC, type ReactNode, useState } from 'react';
import { useAppNavigation, type NavKey } from '../app/app-navigation';
import { useCurrentUser } from '../app/current-user';
import { useMobile } from '../hooks';
import { useMediaQuery } from '../hooks/useResponsive';
import { requestGallerySearch } from '../app/gallery-search';

type NavItemProps = {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number | null;
  rail?: boolean;
  trailing?: ReactNode;
};

const NavItem: FC<NavItemProps> = ({ icon, label, active, onClick, count, rail, trailing }) => (
  <div className="group/nav relative">
    <button
      type="button"
      onClick={onClick}
      title={rail ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-[10px] text-sm transition-colors ${
        rail ? 'h-11 justify-center' : 'h-10 px-3'
      } ${
        active
          ? 'bg-primary-container font-medium text-on-surface shadow-[inset_2px_0_0_var(--mp-accent)]'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${active ? 'text-primary' : ''}`}>{icon}</span>
      {!rail && <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
      {!rail && typeof count === 'number' && count > 0 && <span className="text-[11.5px] tabular-nums text-outline/80">{count}</span>}
    </button>
    {!rail && trailing}
  </div>
);

const GroupLabel: FC<{ children: ReactNode; action?: ReactNode }> = ({ children, action }) => (
  <div className="flex items-center justify-between px-3 pb-1.5 pt-4">
    <span className="text-[10.5px] tracking-[0.32em] text-outline/80">{children}</span>
    {action}
  </div>
);

const ScanStatus: FC<{ rail?: boolean }> = ({ rail }) => {
  const { isAnyScanning } = useAppNavigation();
  if (!isAnyScanning) return null;
  if (rail) {
    return (
      <div className="flex h-11 items-center justify-center text-primary" title="正在扫描图库">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  return (
    <div role="status" className="mx-1 mb-2 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs text-on-surface-variant">
      <span className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        正在扫描图库…
      </span>
      <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-surface-container-high">
        <span className="block h-full w-1/3 animate-[mp-scan_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
      </span>
    </div>
  );
};

const isLibraryActive = (active: NavKey, id: string) => active === `library:${id}`;

/** 侧栏内容：浏览 / 整理 / 图库三组，管理入口沉到底部。rail=true 时只显示图标。 */
const SidebarNav: FC<{ rail?: boolean; onAfterNavigate?: () => void; showBrowse?: boolean }> = ({ rail = false, onAfterNavigate, showBrowse = true }) => {
  const nav = useAppNavigation();
  const { isAdmin } = useCurrentUser();
  const go = (action: () => void) => () => {
    action();
    onAfterNavigate?.();
  };

  return (
    <>
      {showBrowse && (
        <>
          <NavItem rail={rail} icon={<Home className="h-[18px] w-[18px]" />} label="首页" active={nav.active === 'home'} onClick={go(nav.onHome)} />
          <NavItem rail={rail} icon={<Images className="h-[18px] w-[18px]" />} label="全部相册" count={nav.albumCount} active={nav.active === 'albums'} onClick={go(nav.onAllAlbums)} />
          <NavItem rail={rail} icon={<Star className="h-[18px] w-[18px]" />} label="收藏" active={nav.active === 'favorites'} onClick={go(nav.onFavorites)} />
        </>
      )}
      <NavItem rail={rail} icon={<Clock className="h-[18px] w-[18px]" />} label="最近浏览" active={nav.active === 'recent'} onClick={go(nav.onRecent)} />

      {rail ? <div className="mx-3 my-2 h-px bg-outline-variant" /> : <GroupLabel>整理</GroupLabel>}
      {showBrowse && (
        <NavItem rail={rail} icon={<FolderTree className="h-[18px] w-[18px]" />} label="目录" active={nav.active === 'directory'} onClick={go(nav.onDirectory)} />
      )}
      <NavItem rail={rail} icon={<Layers3 className="h-[18px] w-[18px]" />} label="智能相册" active={nav.active === 'smart'} onClick={go(nav.onSmart)} />

      {!rail && nav.libraryRoots.length > 0 && (
        <>
          <GroupLabel
            action={isAdmin ? (
              <button
                type="button"
                onClick={nav.onScanAll}
                disabled={nav.isAnyScanning}
                title="扫描全部图库"
                aria-label="扫描全部图库"
                className="rounded-md p-1 text-outline transition-colors hover:text-on-surface disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${nav.isAnyScanning ? 'animate-spin' : ''}`} />
              </button>
            ) : undefined}
          >
            图库
          </GroupLabel>
          {nav.libraryRoots.map((root) => (
            <NavItem
              key={root.id}
              icon={nav.isScanning(root.id) ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <HardDrive className="h-4 w-4" />}
              label={root.name}
              active={isLibraryActive(nav.active, root.id)}
              onClick={go(() => nav.onLibrary(root.id))}
              trailing={isAdmin ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    nav.onScanOne(root.id);
                  }}
                  disabled={nav.isScanning(root.id)}
                  title="重新扫描此图库"
                  aria-label={`重新扫描 ${root.name}`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-outline opacity-0 transition-opacity hover:text-on-surface focus-visible:opacity-100 group-hover/nav:opacity-100 disabled:opacity-40"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              ) : undefined}
            />
          ))}
        </>
      )}
    </>
  );
};

const SidebarFooter: FC<{ rail?: boolean; onAfterNavigate?: () => void }> = ({ rail = false, onAfterNavigate }) => {
  const nav = useAppNavigation();
  const { isAdmin, user } = useCurrentUser();
  const go = (action: () => void) => () => {
    action();
    onAfterNavigate?.();
  };
  const name = user?.username ?? '';

  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-outline-variant/70 pt-3">
      <ScanStatus rail={rail} />
      {isAdmin && (
        <NavItem rail={rail} icon={<Share2 className="h-[18px] w-[18px]" />} label="分享管理" active={nav.active === 'share'} onClick={go(nav.onShareManagement)} />
      )}
      <NavItem rail={rail} icon={<Settings className="h-[18px] w-[18px]" />} label="设置" active={nav.active === 'settings'} onClick={go(nav.onSettings)} />
      <div className={`mt-1 flex items-center gap-2.5 rounded-[10px] ${rail ? 'flex-col py-1' : 'px-2 py-1.5'}`}>
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-container text-xs font-semibold text-primary"
        >
          {name ? name.slice(0, 1).toUpperCase() : <UserRound className="h-4 w-4" />}
        </span>
        {!rail && <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{name || '当前账号'}</span>}
        <button
          type="button"
          onClick={nav.onLogout}
          title="退出登录"
          aria-label="退出登录"
          className="rounded-md p-1.5 text-outline transition-colors hover:text-on-surface"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const Brand: FC<{ rail?: boolean }> = ({ rail }) => (
  <div className={`flex items-center gap-2.5 ${rail ? 'justify-center pb-4' : 'px-2 pb-4'}`}>
    <span className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-outline-variant bg-primary-container text-primary">
      <Images className="h-4 w-4" />
    </span>
    {!rail && <span className="mp-title text-[17px]">Moment Pic</span>}
  </div>
);

/** 手机端：底部玻璃标签栏 + 「我的」抽屉。 */
const MobileTabBar: FC = () => {
  const nav = useAppNavigation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMineActive = nav.active === 'recent' || nav.active === 'smart' || nav.active === 'share' || nav.active === 'settings' || nav.active.startsWith('library:');
  const tabs: Array<{ key: string; label: string; icon: ReactNode; active: boolean; onClick: () => void }> = [
    { key: 'home', label: '首页', icon: <Home className="h-5 w-5" />, active: nav.active === 'home', onClick: nav.onHome },
    { key: 'albums', label: '相册', icon: <Images className="h-5 w-5" />, active: nav.active === 'albums', onClick: nav.onAllAlbums },
    { key: 'favorites', label: '收藏', icon: <Star className="h-5 w-5" />, active: nav.active === 'favorites', onClick: nav.onFavorites },
    { key: 'directory', label: '目录', icon: <FolderTree className="h-5 w-5" />, active: nav.active === 'directory', onClick: nav.onDirectory },
    { key: 'mine', label: '我的', icon: <UserRound className="h-5 w-5" />, active: isMineActive || sheetOpen, onClick: () => setSheetOpen(true) },
  ];

  return (
    <>
      <nav
        aria-label="主导航"
        className="mp-glass-panel fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 flex h-16 items-center justify-around rounded-[22px]"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={tab.onClick}
            aria-current={tab.active ? 'page' : undefined}
            className={`flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] transition-colors ${tab.active ? 'text-primary' : 'text-on-surface-variant'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      <AnimatePresence>
        {sheetOpen && (
          <>
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
              className="fixed inset-0 z-50 mp-scrim"
            />
            <m.div
              role="dialog"
              aria-label="我的"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="mp-glass-solid fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-[24px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline/30" />
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="mp-title text-lg">我的</span>
                <button type="button" onClick={() => setSheetOpen(false)} aria-label="关闭" className="rounded-full p-2 text-outline">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                <SidebarNav showBrowse={false} onAfterNavigate={() => setSheetOpen(false)} />
                <SidebarFooter onAfterNavigate={() => setSheetOpen(false)} />
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

/**
 * 全局导航。桌面 ≥1280px 为完整侧栏；640–1279px 收起为图标栏；手机为底部标签栏。
 * 内容区用 .mp-with-sidebar 让出侧栏宽度。
 */
export const Sidebar: FC = () => {
  const isMobile = useMobile();
  const isWide = useMediaQuery('(min-width: 1280px)');

  if (isMobile) return <MobileTabBar />;

  const rail = !isWide;
  return (
    <aside
      aria-label="主导航"
      className={`mp-glass-panel fixed bottom-3.5 left-3.5 top-3.5 z-40 flex flex-col rounded-[18px] ${rail ? 'w-[72px] px-2.5 py-5' : 'w-[248px] px-3.5 py-5'}`}
    >
      <Brand rail={rail} />
      {!rail && (
        <button
          type="button"
          onClick={requestGallerySearch}
          className="mx-0.5 mb-3 flex h-9 items-center gap-2 rounded-[10px] border border-outline-variant bg-surface-container-lowest px-3 text-[13px] text-outline transition-colors hover:text-on-surface"
        >
          <Search className="h-3.5 w-3.5" />
          搜索相册
          <kbd className="ml-auto rounded border border-outline-variant px-1.5 text-[10px] font-sans">/</kbd>
        </button>
      )}
      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <SidebarNav rail={rail} />
      </div>
      <SidebarFooter rail={rail} />
    </aside>
  );
};

