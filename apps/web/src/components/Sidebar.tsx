import { AnimatePresence, motion } from 'motion/react';
import { Camera, Clock, Images, Loader2, Menu, RefreshCw, Settings, X } from 'lucide-react';
import { type FC, useState } from 'react';
import { useMobile, useWideMobile } from '../hooks';
import type { LibraryRootDTO } from '../types/api';

interface SidebarProps {
  activeTab: 'gallery' | 'settings';
  onNavigate: (tab: 'gallery' | 'settings') => void;
  libraryRoots: LibraryRootDTO[];
  currentLibraryRootId: string;
  onLibraryRootChange: (id: string) => void;
  onScanAll: () => void;
  onScanOne: (libraryRootId: string) => void;
  isAnyScanning: boolean;
  isScanning: (libraryRootId: string) => boolean;
  albumCount: number;
  onRecentClick: () => void;
  isRecentActive: boolean;
}

export const Sidebar: FC<SidebarProps> = ({
  activeTab,
  onNavigate,
  libraryRoots,
  currentLibraryRootId,
  onLibraryRootChange,
  onScanAll,
  onScanOne,
  isAnyScanning,
  isScanning,
  albumCount,
  onRecentClick,
  isRecentActive,
}) => {
  const isMobile = useMobile();
  const isWideMobile = useWideMobile();
  const [isOpen, setIsOpen] = useState(false);

  const drawerWidthClass = isWideMobile ? 'w-[min(18rem,72vw)] max-w-[72vw]' : 'w-80 max-w-[88vw]';
  const drawerPaddingClass = isWideMobile
    ? 'px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-[calc(env(safe-area-inset-bottom)+1.25rem)]'
    : 'px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]';

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex flex-col items-start gap-2 md:mb-10">
        <div className="flex items-center gap-3">
          <span className="font-script text-2xl font-bold tracking-tight text-on-primary-container md:text-4xl">Moment Pic</span>
          <Camera className="h-6 w-6 text-on-primary-container md:h-8 md:w-8" />
        </div>
        <p className="hidden font-headline text-xs tracking-[0.24em] text-outline md:block">记录每一次温柔瞬间</p>
      </div>

      <div className="mb-8 hidden w-full md:block">
        <div className="sticky-note-mask flex flex-col items-center justify-center rounded-2xl border border-on-tertiary-container/10 bg-tertiary-container p-5 shadow-lg">
          <span className="font-headline text-3xl font-extrabold text-on-tertiary-container">{albumCount}</span>
          <span className="font-label text-sm tracking-wide text-on-tertiary-container/70">当前已收录相册</span>
        </div>
      </div>

      <nav className="mb-6 flex w-full flex-col gap-3 md:mb-10">
        <button
          onClick={() => {
            onNavigate('gallery');
            if (isMobile) {
              setIsOpen(false);
            }
          }}
          className={`flex items-center gap-4 rounded-full px-6 py-4 font-headline tracking-tight transition-all duration-300 hover:scale-[1.02] ${
            activeTab === 'gallery'
              ? 'bg-primary-container font-bold text-on-primary-container shadow-md'
              : 'font-semibold text-outline hover:bg-primary-container/20'
          }`}
        >
          <Images className="h-6 w-6" />
          <span>图库</span>
        </button>
        <button
          onClick={() => {
            onNavigate('settings');
            if (isMobile) {
              setIsOpen(false);
            }
          }}
          className={`flex items-center gap-4 rounded-full px-6 py-4 font-headline tracking-tight transition-all duration-300 hover:scale-[1.02] ${
            activeTab === 'settings'
              ? 'bg-primary-container font-bold text-on-primary-container shadow-md'
              : 'font-semibold text-outline hover:bg-primary-container/20'
          }`}
        >
          <Settings className="h-6 w-6" />
          <span>设置</span>
        </button>
      </nav>

      <div className="mt-auto flex max-h-[40vh] flex-col gap-4 overflow-y-auto border-t border-outline/10 pt-6 md:pt-8">
        <button
          onClick={() => {
            onLibraryRootChange('');
            if (isMobile) {
              setIsOpen(false);
            }
          }}
          className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 transition-all ${
            currentLibraryRootId === '' && !isRecentActive
              ? 'bg-primary-container font-bold text-on-primary-container'
              : 'hover:bg-primary-container/10'
          }`}
        >
          <Images className="h-5 w-5" />
          <span className="text-sm font-semibold">全部图片</span>
        </button>

        <button
          onClick={() => {
            onRecentClick();
            if (isMobile) {
              setIsOpen(false);
            }
          }}
          className={`flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 transition-all ${
            isRecentActive
              ? 'bg-primary-container font-bold text-on-primary-container'
              : 'hover:bg-primary-container/10'
          }`}
        >
          <Clock className="h-5 w-5" />
          <span className="text-sm font-semibold">最近浏览</span>
        </button>

        {libraryRoots.map((root) => (
          <div
            key={root.id}
            className={`flex min-h-11 items-center gap-2 rounded-xl px-4 py-3 transition-all ${
              currentLibraryRootId === root.id
                ? 'bg-primary-container font-bold text-on-primary-container'
                : 'hover:bg-primary-container/10'
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLibraryRootChange(root.id);
                if (isMobile) {
                  setIsOpen(false);
                }
              }}
              className="flex flex-1 items-center gap-3"
            >
              <Images className="h-5 w-5" />
              <span className="truncate text-sm font-semibold">{root.name}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onScanOne(root.id);
              }}
              disabled={isScanning(root.id)}
              className="rounded-lg p-2 disabled:opacity-50 hover:bg-white/20"
              title="扫描此图集"
            >
              {isScanning(root.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
        ))}

        <button
          onClick={() => {
            onScanAll();
            if (isMobile) {
              setIsOpen(false);
            }
          }}
          disabled={isAnyScanning}
          className="mt-2 flex items-center justify-center gap-2 rounded-2xl border border-outline/15 bg-white/50 px-4 py-3 text-sm font-semibold text-outline transition-all hover:bg-primary-container/15 hover:text-on-primary-container disabled:opacity-50"
        >
          {isAnyScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {isAnyScanning ? '正在扫描图库...' : '扫描全部图库'}
        </button>

        <div className="flex items-center justify-center rounded-lg border border-outline/5 bg-white/40 p-3 text-[12px] font-medium text-outline/80">
          记录美好的瞬间
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setIsOpen(true)}
          className="pointer-events-auto fixed left-4 top-4 z-50 rounded-full bg-surface-container-high/85 p-3 shadow-lg transition-colors hover:bg-surface-container-high md:left-6 md:top-6"
          title="打开侧边栏"
        >
          <Menu className="h-5 w-5 text-on-surface text-opacity-80 md:h-6 md:w-6" />
        </button>

        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 z-40 bg-black/50"
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={`fixed left-0 top-0 z-50 h-full bg-surface-container-low shadow-xl ${drawerWidthClass} ${drawerPaddingClass}`}
              >
                <button
                  onClick={() => setIsOpen(false)}
                  className="absolute right-4 top-6 p-2 text-outline transition-colors hover:text-on-surface"
                  title="关闭侧边栏"
                >
                  <X className="h-5 w-5 md:h-6 md:w-6" />
                </button>
                {sidebarContent}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <aside className={`fixed left-0 top-0 z-40 flex h-full flex-col rounded-r-[3rem] border-r border-outline/5 bg-surface-container-low p-8 shadow-[32px_0_48px_-4px_rgba(111,78,55,0.06)] ${isWideMobile ? 'w-[18rem]' : 'w-80'}`}>
      {sidebarContent}
    </aside>
  );
};
