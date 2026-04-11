import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Book, Image as ImageIcon, LayoutGrid, FolderOpen, Settings } from 'lucide-react';

interface LocalGalleryScreenProps {
  onBack: () => void;
  onNavigateToGallery: () => void;
  activeTab: 'gallery' | 'manage' | 'settings';
  onSidebarNavigate: (tab: 'gallery' | 'manage' | 'settings') => void;
}

export const LocalGalleryScreen: React.FC<LocalGalleryScreenProps> = ({ 
  onBack, 
  onNavigateToGallery,
  activeTab,
  onSidebarNavigate
}) => {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <aside className="w-80 bg-surface-container-low p-8 flex flex-col border-r border-outline/5">
        <div className="mb-10 flex items-center gap-3">
          <FolderOpen className="text-on-primary-container w-8 h-8" />
          <h1 className="text-2xl font-bold text-on-primary-container font-script">本地文件</h1>
        </div>

        <nav className="flex flex-col gap-3">
          <button 
            onClick={() => onSidebarNavigate('gallery')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === 'gallery' 
                ? 'bg-primary-container text-on-primary-container font-bold' 
                : 'text-outline hover:bg-primary-container/10 font-medium'
            }`}
          >
            <LayoutGrid className="w-5 h-5" />
            <span>相册</span>
          </button>
          <button 
            onClick={() => onSidebarNavigate('manage')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === 'manage' 
                ? 'bg-primary-container text-on-primary-container font-bold' 
                : 'text-outline hover:bg-primary-container/10 font-medium'
            }`}
          >
            <FolderOpen className="w-5 h-5" />
            <span>本地文件</span>
          </button>
          <button 
            onClick={() => onSidebarNavigate('settings')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === 'settings' 
                ? 'bg-primary-container text-on-primary-container font-bold' 
                : 'text-outline hover:bg-primary-container/10 font-medium'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>设置</span>
          </button>
        </nav>
      </aside>

      <main className="flex-1 p-12 overflow-y-auto custom-scrollbar">
        <header className="flex items-center gap-6 mb-12">
          <button 
            onClick={onBack}
            className="p-3 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container transition-all"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-4xl font-headline font-black text-on-surface">本地文件</h2>
        </header>

        <div className="bg-surface-container-highest rounded-2xl p-8 text-center">
          <Book className="w-16 h-16 text-outline/30 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-on-surface mb-2">本地文件管理</h3>
          <p className="text-outline mb-6">在这里管理您的图片库目录</p>
          <button 
            onClick={() => onSidebarNavigate('settings')}
            className="px-6 py-3 bg-primary-container text-on-primary-container rounded-full font-bold hover:brightness-95 transition-all"
          >
            前往设置页面管理库目录
          </button>
        </div>
      </main>
    </div>
  );
};
