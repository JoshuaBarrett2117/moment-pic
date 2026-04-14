import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Images, Settings, RefreshCw, Loader2, Clock, Menu, X } from 'lucide-react';
import { useMobile } from '../hooks';
import type { LibraryRootDTO } from '../types/api';

interface SidebarProps {
  activeTab: 'gallery' | 'settings';
  onNavigate: (tab: 'gallery' | 'settings') => void;
  onProfileClick: () => void;
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

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  onNavigate, 
  onProfileClick,
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
  const [isOpen, setIsOpen] = useState(false);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="mb-6 md:mb-10 flex flex-col items-start gap-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl md:text-4xl font-bold text-on-primary-container font-script tracking-tight">Moment Pic</span>
          <Camera className="text-on-primary-container w-6 md:w-8 h-6 md:h-8" />
        </div>
        <p className="hidden md:block text-xs font-headline uppercase tracking-widest text-outline">The Curated Heirloom</p>
      </div>

      <div className="hidden md:block mb-8 w-full">
        <div className="bg-tertiary-container sticky-note-mask p-5 -rotate-2 shadow-lg flex flex-col items-center justify-center border border-on-tertiary-container/10 rounded-2xl">
          <span className="text-3xl font-headline font-extrabold text-on-tertiary-container">{albumCount}</span>
          <span className="text-sm font-label uppercase tracking-tighter text-on-tertiary-container/70">Albums Collected</span>
        </div>
      </div>

      <button
        onClick={() => {
          if (confirm('确定要扫描全部图库吗？')) {
            onScanAll();
          }
        }}
        disabled={isAnyScanning}
        className="mb-4 flex items-center justify-center gap-2 px-4 py-3 bg-primary-container text-on-primary-container rounded-full font-bold hover:brightness-95 transition-all disabled:opacity-50"
      >
        {isAnyScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className={`w-4 h-4 ${isAnyScanning ? 'animate-spin' : ''}`} />}
        {isAnyScanning ? '扫描中...' : '刷新全部'}
      </button>

      <nav className="flex flex-col gap-3 w-full mb-6 md:mb-10">
        <button 
          onClick={() => { onNavigate('gallery'); isMobile && setIsOpen(false); }}
          className={`flex items-center gap-4 px-6 py-4 rounded-full transition-all duration-300 font-headline tracking-tight hover:scale-[1.02] ${
            activeTab === 'gallery' 
              ? 'bg-primary-container text-on-primary-container shadow-md font-bold' 
              : 'text-outline hover:bg-primary-container/20 font-semibold'
          }`}
        >
          <Images className="w-6 h-6" />
          <span>相册</span>
        </button>
        <button 
          onClick={() => { onNavigate('settings'); isMobile && setIsOpen(false); }}
          className={`flex items-center gap-4 px-6 py-4 rounded-full transition-all duration-300 font-headline tracking-tight hover:scale-[1.02] ${
            activeTab === 'settings' 
              ? 'bg-primary-container text-on-primary-container shadow-md font-bold' 
              : 'text-outline hover:bg-primary-container/20 font-semibold'
          }`}
        >
          <Settings className="w-6 h-6" />
          <span>设置</span>
        </button>
      </nav>

      <div className="flex flex-col gap-6 w-full">
      </div>

      <div className="mt-auto pt-6 md:pt-8 border-t border-outline/10 flex flex-col gap-4 max-h-[40vh] overflow-y-auto">
        <button
          onClick={() => { onLibraryRootChange(''); isMobile && setIsOpen(false); }}
          className={`flex items-center gap-3 px-4 py-2 rounded-xl cursor-pointer transition-all ${
            currentLibraryRootId === '' && !isRecentActive
              ? 'bg-primary-container text-on-primary-container font-bold' 
              : 'hover:bg-primary-container/10'
          }`}
        >
          <Images className="w-5 h-5" />
          <span className="text-sm font-semibold">全部图片</span>
        </button>

        <button
          onClick={() => { onRecentClick(); isMobile && setIsOpen(false); }}
          className={`flex items-center gap-3 px-4 py-2 rounded-xl cursor-pointer transition-all ${
            isRecentActive
              ? 'bg-primary-container text-on-primary-container font-bold' 
              : 'hover:bg-primary-container/10'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-sm font-semibold">近期查看</span>
        </button>
        
        {libraryRoots.map((root) => (
          <div
            key={root.id}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all ${
              currentLibraryRootId === root.id 
                ? 'bg-primary-container text-on-primary-container font-bold' 
                : 'hover:bg-primary-container/10'
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLibraryRootChange(root.id);
                isMobile && setIsOpen(false);
              }}
              className="flex items-center gap-3 flex-1"
            >
              <Images className="w-5 h-5" />
              <span className="text-sm font-semibold truncate">{root.name}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onScanOne(root.id);
              }}
              disabled={isScanning(root.id)}
              className="p-1.5 rounded-lg hover:bg-white/20 disabled:opacity-50"
              title="刷新此图库"
            >
              {isScanning(root.id) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
          </div>
        ))}
        
        <div className="mt-2 md:mt-4 p-3 bg-white/40 border border-outline/5 rounded-lg flex items-center justify-center text-[12px] font-medium text-outline/80">
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
          className="fixed top-4 md:top-6 left-4 md:left-6 z-50 p-2.5 md:p-3 bg-surface-container-high/80 backdrop-blur-md rounded-full shadow-lg hover:bg-surface-container-high transition-colors pointer-events-auto"
        >
          <Menu className="w-5 h-5 md:w-6 md:h-6 text-on-surface text-opacity-80" />
        </button>
        
        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 bg-black/50 z-40"
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed left-0 top-0 h-full w-80 max-w-[85vw] bg-surface-container-low p-6 z-50 shadow-xl"
              >
                <button
                  onClick={() => setIsOpen(false)}
                  className="absolute top-6 right-4 p-2 text-outline hover:text-on-surface transition-colors"
                >
                  <X className="w-5 h-5 md:w-6 md:h-6" />
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
    <aside className="fixed left-0 top-0 h-full w-80 bg-surface-container-low p-8 flex flex-col z-40 rounded-r-[3rem] shadow-[32px_0_48px_-4px_rgba(111,78,55,0.06)] border-r border-outline/5">
      {sidebarContent}
    </aside>
  );
};
