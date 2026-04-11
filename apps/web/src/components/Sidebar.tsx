import React from 'react';
import { motion } from 'motion/react';
import { Camera, Images, Settings, Search, RefreshCw, Loader2 } from 'lucide-react';
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
  isScanning: (libraryRootId: string) => boolean;
  albumCount: number;
  currentKeyword: string;
  onKeywordChange: (keyword: string) => void;
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
  isScanning,
  albumCount,
  currentKeyword,
  onKeywordChange,
}) => {
  const isAnyScanning = libraryRoots.some(root => isScanning(root.id));

  return (
    <aside className="fixed left-0 top-0 h-full w-80 bg-surface-container-low p-8 flex flex-col z-40 rounded-r-[3rem] shadow-[32px_0_48px_-4px_rgba(111,78,55,0.06)] border-r border-outline/5">
      <div className="mb-10 flex flex-col items-start gap-2">
        <div className="flex items-center gap-3">
          <span className="text-4xl font-bold text-on-primary-container font-script tracking-tight">Moment Pic</span>
          <Camera className="text-on-primary-container w-8 h-8" />
        </div>
        <p className="text-xs font-headline uppercase tracking-widest text-outline">The Curated Heirloom</p>
      </div>

      <div className="mb-8 w-full">
        <div className="bg-tertiary-container sticky-note-mask p-5 -rotate-2 shadow-lg flex flex-col items-center justify-center border border-on-tertiary-container/10 rounded-2xl">
          <span className="text-3xl font-headline font-extrabold text-on-tertiary-container">{albumCount}</span>
          <span className="text-sm font-label uppercase tracking-tighter text-on-tertiary-container/70">Albums Collected</span>
        </div>
      </div>

      <button
        onClick={onScanAll}
        disabled={isAnyScanning}
        className="mb-4 flex items-center justify-center gap-2 px-4 py-3 bg-primary-container text-on-primary-container rounded-full font-bold hover:brightness-95 transition-all disabled:opacity-50"
      >
        {isAnyScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className={`w-4 h-4 ${isAnyScanning ? 'animate-spin' : ''}`} />}
        {isAnyScanning ? '扫描中...' : '刷新全部'}
      </button>

      <nav className="flex flex-col gap-3 w-full mb-10">
        <button 
          onClick={() => onNavigate('gallery')}
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
          onClick={() => onNavigate('settings')}
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
        <div className="relative">
          <input 
            className="w-full bg-surface-container-highest border-2 border-outline/30 rounded-full py-3 px-12 focus:ring-2 focus:ring-primary-container focus:border-transparent outline-none text-sm placeholder:text-outline/50 wobbly-border" 
            placeholder="Search memories..." 
            type="text"
            value={currentKeyword}
            onChange={(event) => onKeywordChange(event.target.value)}
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-outline w-5 h-5" />
        </div>
      </div>

      <div className="mt-auto pt-8 border-t border-outline/10 flex flex-col gap-4">
        <button
          onClick={() => onLibraryRootChange('')}
          className={`flex items-center gap-3 px-4 py-2 rounded-xl cursor-pointer transition-all ${
            currentLibraryRootId === '' 
              ? 'bg-primary-container text-on-primary-container font-bold' 
              : 'hover:bg-primary-container/10'
          }`}
        >
          <Images className="w-5 h-5" />
          <span className="text-sm font-semibold">全部图片</span>
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
        
        <div className="mt-4 p-3 bg-white/40 border border-outline/5 rounded-lg flex items-center justify-center text-[12px] font-medium text-outline/80">
          记录美好的瞬间
        </div>
      </div>
    </aside>
  );
};
