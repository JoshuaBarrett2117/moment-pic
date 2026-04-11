import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Home, Pin, Heart, Sparkles, Leaf, PenTool, Paperclip } from 'lucide-react';
import { Polaroid } from './Polaroid';

interface AlbumDetailScreenProps {
  albumId: string;
  onBack: () => void;
}

export const AlbumDetailScreen: React.FC<AlbumDetailScreenProps> = ({ albumId, onBack }) => {
  return (
    <div className="flex h-screen w-full bg-surface overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[280px] bg-surface-container-low h-full flex flex-col px-6 pt-10 pb-8 z-10 relative overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center -rotate-3 shadow-sm">
            <span className="material-symbols-outlined text-on-primary-container">photo_camera</span>
          </div>
          <h1 className="text-xl font-headline font-extrabold tracking-tight text-primary">Moment Pic</h1>
        </div>

        {/* Back Button */}
        <div className="mb-8 flex">
          <button 
            onClick={onBack}
            className="bg-secondary-container text-on-secondary-container px-4 py-1.5 rounded-sm text-xs font-medium rotate-1 shadow-sm wobbly-mask flex items-center gap-1 hover:brightness-95 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </button>
        </div>

        {/* Scrapbook Decorations */}
        <div className="flex-1 flex flex-col gap-12 py-8 relative">
          <div className="relative">
            <div className="washi-tape absolute -top-4 -left-2 z-0 w-20 h-5" />
            <div className="relative z-10 pl-4">
              <Pin className="text-on-primary-container rotate-[25deg] w-8 h-8" />
            </div>
          </div>

          <div className="flex flex-col items-center gap-16 mt-4">
            <Heart className="w-10 h-10 text-primary opacity-40 rotate-12 fill-primary" />
            <Sparkles className="w-8 h-8 text-primary opacity-30 -rotate-8 self-start ml-8" />
            <Leaf className="w-6 h-6 text-primary opacity-40 rotate-6 self-end mr-8" />
          </div>

          <div className="mt-auto opacity-20 text-primary self-center">
            <PenTool className="w-12 h-12 -rotate-12" />
          </div>
        </div>

        {/* Summary Note */}
        <div className="mt-auto bg-tertiary-container p-6 rounded-2xl -rotate-2 shadow-sm relative wobbly-mask">
          <Paperclip className="absolute -top-3 right-4 text-outline rotate-12 w-5 h-5" />
          <p className="text-sm font-medium text-on-tertiary-container leading-relaxed">
            共 10 张图片 | 45MB
          </p>
          <p className="text-[10px] mt-2 text-on-tertiary-container/60">更新于 2024.05.20</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-surface relative">
        <header className="h-32 flex flex-col justify-center px-12 pt-8">
          <h2 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">{albumId} - 瞬间详情</h2>
        </header>

        {/* Image Grid */}
        <section className="flex-1 overflow-y-auto px-12 py-8 custom-scrollbar scroll-smooth">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-12">
            {Array.from({ length: 10 }).map((_, i) => (
              <Polaroid 
                key={i}
                src={`https://picsum.photos/seed/cat${i}/400/400`}
                caption={`IMG_0834_${String(i + 1).padStart(2, '0')}`}
                rotation={(i % 3 - 1) * 2}
                className="w-full"
              />
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="h-20 px-12 border-t-2 border-outline/5 flex items-center justify-between bg-surface/50 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3 text-outline-variant/80">
            <Paperclip className="w-4 h-4" />
            <code className="text-xs font-medium tracking-tight">/Volume1/pb1/00834-黑兔/moments/2024_05/</code>
          </div>
        </footer>
      </main>

      {/* Bottom Nav (Mobile) */}
      <nav className="fixed bottom-0 w-full z-50 flex justify-around items-center px-6 pb-6 pt-2 md:hidden bg-white/80 backdrop-blur-xl shadow-lg rounded-t-[3rem]">
        <button onClick={onBack} className="flex flex-col items-center text-outline hover:opacity-80 transition-opacity">
          <Home className="w-6 h-6" />
          <span className="text-[10px] uppercase tracking-widest">Home</span>
        </button>
        <button onClick={onBack} className="flex flex-col items-center text-outline hover:opacity-80 transition-opacity">
          <ArrowLeft className="w-6 h-6" />
          <span className="text-[10px] uppercase tracking-widest">Back</span>
        </button>
      </nav>
    </div>
  );
};
