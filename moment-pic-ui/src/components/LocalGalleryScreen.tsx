import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Book, Image as ImageIcon, LayoutGrid } from 'lucide-react';

interface LocalGalleryScreenProps {
  onBack: () => void;
  onNavigateToGallery: () => void;
}

export const LocalGalleryScreen: React.FC<LocalGalleryScreenProps> = ({ 
  onBack, 
  onNavigateToGallery 
}) => {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar (Simplified for this view) */}
      <aside className="w-80 bg-surface-container-low p-8 flex flex-col border-r border-outline/5">
        <div className="mb-10 flex items-center gap-3">
          <Book className="text-on-primary-container w-8 h-8" />
          <h1 className="text-2xl font-bold text-on-primary-container font-script">Local Gallery</h1>
        </div>

        <nav className="flex flex-col gap-4">
          <button 
            onClick={onNavigateToGallery}
            className="flex items-center gap-3 text-outline hover:text-on-primary-container font-headline font-semibold px-4 py-2 rounded-lg hover:bg-primary-container/10 transition-all"
          >
            <LayoutGrid className="w-5 h-5" />
            <span>Albums</span>
          </button>
          <button 
            onClick={onNavigateToGallery}
            className="flex items-center gap-3 text-outline hover:text-on-primary-container font-headline font-semibold px-4 py-2 rounded-lg hover:bg-primary-container/10 transition-all"
          >
            <Book className="w-5 h-5" />
            <span>Journal</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-12 overflow-y-auto custom-scrollbar">
        <header className="flex items-center gap-6 mb-12">
          <button 
            onClick={onBack}
            className="p-3 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container transition-all"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-4xl font-headline font-black text-on-surface">Local Files</h2>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.div 
              key={i}
              whileHover={{ scale: 1.02 }}
              className="bg-surface-container-highest rounded-2xl p-4 shadow-md border border-outline/5"
            >
              <div className="aspect-square bg-surface-container-high rounded-xl flex items-center justify-center mb-4">
                <ImageIcon className="w-10 h-10 text-outline/20" />
              </div>
              <p className="text-sm font-bold text-on-surface-variant truncate">Memory_File_{i + 1}.jpg</p>
              <p className="text-xs text-outline mt-1">2.4 MB • 2024.05.20</p>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
};
