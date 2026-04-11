import React from 'react';
import { motion } from 'motion/react';
import { Camera, Images, Settings, Search, Heart, Cloud, Paperclip } from 'lucide-react';

interface SidebarProps {
  activeTab: 'gallery' | 'manage';
  onNavigate: (tab: 'gallery' | 'manage') => void;
  onProfileClick: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onNavigate, onProfileClick }) => {
  return (
    <aside className="fixed left-0 top-0 h-full w-80 bg-surface-container-low p-8 flex flex-col z-40 rounded-r-[3rem] shadow-[32px_0_48px_-4px_rgba(111,78,55,0.06)] border-r border-outline/5">
      {/* Brand Identity */}
      <div className="mb-10 flex flex-col items-start gap-2">
        <div className="flex items-center gap-3">
          <span className="text-4xl font-bold text-on-primary-container font-script tracking-tight">Moment Pic</span>
          <Camera className="text-on-primary-container w-8 h-8" />
        </div>
        <p className="text-xs font-headline uppercase tracking-widest text-outline">The Curated Heirloom</p>
      </div>

      {/* Stats Sticky Note */}
      <div className="mb-8 w-full">
        <div className="bg-tertiary-container sticky-note-mask p-5 -rotate-2 shadow-lg flex flex-col items-center justify-center border border-on-tertiary-container/10 rounded-2xl">
          <span className="text-3xl font-headline font-extrabold text-on-tertiary-container">2505</span>
          <span className="text-sm font-label uppercase tracking-tighter text-on-tertiary-container/70">Albums Collected</span>
        </div>
      </div>

      {/* Navigation */}
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
          <span>Local Gallery</span>
        </button>
        <button 
          onClick={() => onNavigate('manage')}
          className={`flex items-center gap-4 px-6 py-4 rounded-full transition-all duration-300 font-headline tracking-tight hover:scale-[1.02] ${
            activeTab === 'manage' 
              ? 'bg-primary-container text-on-primary-container shadow-md font-bold' 
              : 'text-outline hover:bg-primary-container/20 font-semibold'
          }`}
        >
          <Settings className="w-6 h-6" />
          <span>Manage</span>
        </button>
      </nav>

      {/* Search & Filters */}
      <div className="flex flex-col gap-6 w-full">
        <div className="relative">
          <input 
            className="w-full bg-surface-container-highest border-2 border-outline/30 rounded-full py-3 px-12 focus:ring-2 focus:ring-primary-container focus:border-transparent outline-none text-sm placeholder:text-outline/50 wobbly-border" 
            placeholder="Search memories..." 
            type="text"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-outline w-5 h-5" />
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="px-4 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold shadow-sm cursor-pointer hover:opacity-80 transition-opacity">Ascending</span>
          <span className="px-4 py-1 rounded-full bg-surface-container-high text-outline text-xs font-medium cursor-pointer hover:bg-secondary-container transition-colors">Descending</span>
          <span className="px-4 py-1 rounded-full bg-surface-container-high text-outline text-xs font-medium cursor-pointer hover:bg-secondary-container transition-colors">24/pg</span>
        </div>
      </div>

      {/* Secondary Sources */}
      <div className="mt-auto pt-8 border-t border-outline/10 flex flex-col gap-4">
        <div className="flex items-center gap-3 px-4 py-2 bg-surface-container-lowest/50 rounded-xl cursor-pointer hover:bg-white transition-all group">
          <Heart className="text-error/70 group-hover:scale-110 transition-transform w-5 h-5 fill-error/70" />
          <span className="text-sm font-semibold text-on-surface-variant">All Images</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-surface-container-lowest/50 rounded-xl cursor-pointer hover:bg-white transition-all group">
          <Cloud className="text-primary/70 group-hover:scale-110 transition-transform w-5 h-5" />
          <span className="text-sm font-semibold text-on-surface-variant">Moment</span>
        </div>
        
        {/* Path Display */}
        <div className="mt-4 p-3 bg-white/40 border border-outline/5 rounded-lg flex items-center gap-2 text-[10px] font-mono text-outline/80">
          <Paperclip className="w-3 h-3" />
          <span className="truncate">/Volume1/pb1/memories/2024_archive</span>
        </div>
      </div>
    </aside>
  );
};
