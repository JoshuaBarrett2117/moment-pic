import React from 'react';
import { motion } from 'motion/react';
import { Filter, Sparkles, Plus, ArrowRight } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { WobblyButton } from './WobblyButton';

interface GalleryScreenProps {
  onNavigateToAlbum: (albumId: string) => void;
  onNavigateToLocalGallery: () => void;
  onProfileClick: () => void;
}

const albums = [
  {
    id: '00834-黑兔之旅',
    title: '00834-黑兔之旅',
    count: 10,
    tag: '日系',
    tagColor: 'bg-[#D4E8CF] text-on-secondary-container',
    images: [
      'https://picsum.photos/seed/tokyo/200/200',
      'https://picsum.photos/seed/shrine/200/200',
      'https://picsum.photos/seed/origami/200/200',
      'https://picsum.photos/seed/tea/200/200',
      'https://picsum.photos/seed/city/200/200',
      'https://picsum.photos/seed/mountain/200/200',
      'https://picsum.photos/seed/room/200/200',
      'https://picsum.photos/seed/fish/200/200',
      'https://picsum.photos/seed/cherry/200/200',
    ]
  },
  {
    id: 'comic-con-2024',
    title: 'Comic Con 2024',
    count: 42,
    tag: 'cosplay',
    tagColor: 'bg-[#EDC3B9] text-on-primary-container',
    images: [
      'https://picsum.photos/seed/hero1/200/200',
      'https://picsum.photos/seed/hero2/200/200',
      'https://picsum.photos/seed/hero3/200/200',
      'https://picsum.photos/seed/hero4/200/200',
    ]
  },
  {
    id: 'golden-hour',
    title: 'Golden Hour Walks',
    count: 125,
    tag: 'Autumn',
    tagColor: 'bg-[#F0C3A6] text-on-tertiary-container',
    images: [
      'https://picsum.photos/seed/walk1/200/200',
      'https://picsum.photos/seed/walk2/200/200',
      'https://picsum.photos/seed/walk3/200/200',
      'https://picsum.photos/seed/walk4/200/200',
      'https://picsum.photos/seed/walk5/200/200',
      'https://picsum.photos/seed/walk6/200/200',
      'https://picsum.photos/seed/walk7/200/200',
      'https://picsum.photos/seed/walk8/200/200',
      'https://picsum.photos/seed/walk9/200/200',
    ]
  }
];

export const GalleryScreen: React.FC<GalleryScreenProps> = ({ 
  onNavigateToAlbum, 
  onNavigateToLocalGallery,
  onProfileClick 
}) => {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar 
        activeTab="gallery" 
        onNavigate={(tab) => tab === 'manage' && onNavigateToLocalGallery()} 
        onProfileClick={onProfileClick}
      />
      
      <main className="ml-80 flex-1 h-full overflow-y-auto custom-scrollbar bg-surface px-12 pt-16 pb-24 relative">
        {/* Header */}
        <header className="flex justify-between items-start w-full mb-16">
          <div className="flex flex-col gap-2">
            <h1 className="text-6xl text-on-surface tracking-tighter leading-tight font-script font-bold">瞬间图库</h1>
            <p className="text-xl font-body text-outline/70">更懂你的，也更懂在这里</p>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-4 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container transition-all">
              <Filter className="w-6 h-6" />
            </button>
            <button className="p-4 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-container transition-all">
              <Sparkles className="w-6 h-6" />
            </button>
            <div 
              onClick={onProfileClick}
              className="w-14 h-14 rounded-full border-4 border-white shadow-xl overflow-hidden hover:scale-105 transition-transform cursor-pointer"
            >
              <img 
                alt="Curator Portrait" 
                className="w-full h-full object-cover" 
                src="https://picsum.photos/seed/portrait/200/200" 
              />
            </div>
          </div>
        </header>

        {/* Album Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {albums.map((album, idx) => (
            <motion.div 
              key={album.id}
              whileHover={{ scale: 1.03, rotate: idx % 2 === 0 ? 1 : -1 }}
              onClick={() => onNavigateToAlbum(album.id)}
              className="group cursor-pointer"
            >
              <div className="relative bg-surface-container-highest rounded-xl p-3 shadow-lg transition-all duration-500">
                {album.tag && (
                  <div className={`absolute -top-3 ${idx % 2 === 0 ? '-right-2 rotate-12' : '-left-3 -rotate-12'} z-10 px-4 py-1 text-xs font-bold rounded-full shadow-sm border border-black/5 ${album.tagColor}`}>
                    {album.tag}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden h-64">
                  {album.images.slice(0, 9).map((img, i) => (
                    <img key={i} className="w-full h-full object-cover" src={img} alt="" />
                  ))}
                  {album.images.length < 9 && Array.from({ length: 9 - album.images.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-surface-container-high flex items-center justify-center">
                      <Plus className="w-6 h-6 text-outline/20" />
                    </div>
                  ))}
                </div>
                <div className="mt-4 px-2 pb-2">
                  <h3 className="text-base font-bold text-on-surface font-headline truncate">{album.title}</h3>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-medium text-outline">{album.count} images</span>
                    <ArrowRight className="text-outline/30 group-hover:text-primary w-4 h-4 transition-colors" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {/* Local Gallery Button Card */}
          <motion.div 
            whileHover={{ scale: 1.03, rotate: -1 }}
            onClick={onNavigateToLocalGallery}
            className="group cursor-pointer"
          >
            <div className="relative bg-surface-container-highest rounded-xl p-3 shadow-lg transition-all duration-500 h-full flex flex-col">
              <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden h-64 bg-surface-container-low">
                <div className="col-span-3 flex items-center justify-center">
                  <WobblyButton variant="secondary" onClick={(e) => { e.stopPropagation(); onNavigateToLocalGallery(); }}>
                    Local Gallery
                  </WobblyButton>
                </div>
              </div>
              <div className="mt-4 px-2 pb-2">
                <h3 className="text-base font-bold text-on-surface font-headline truncate">View Local Files</h3>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-medium text-outline">Browse all directories</span>
                  <ArrowRight className="text-outline/30 group-hover:text-primary w-4 h-4 transition-colors" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Infinite Loading Indicator */}
        <div className="mt-32 mb-12 flex flex-col items-center justify-center gap-6 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent pointer-events-none h-48 -top-32" />
          <div className="flex items-center gap-4">
            <span className="w-12 h-[2px] bg-outline/20 rounded-full" />
            <p className="text-2xl font-script font-bold text-outline/60 animate-pulse">Loading more memories...</p>
            <span className="w-12 h-[2px] bg-outline/20 rounded-full" />
          </div>
        </div>

        {/* FAB */}
        <button className="fixed bottom-12 right-12 bg-primary-container text-on-primary-container p-6 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all flex items-center gap-3 group z-40">
          <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
          <span className="font-bold font-headline pr-2">Add Memory</span>
        </button>
      </main>
    </div>
  );
};
