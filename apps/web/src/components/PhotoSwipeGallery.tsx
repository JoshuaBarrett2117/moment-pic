import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import type { AssetListItemDTO } from '../types/api';

interface PhotoSwipeGalleryProps {
  items: AssetListItemDTO[];
  isOpen: boolean;
  onClose: () => void;
  initialIndex?: number;
}

export const PhotoSwipeGallery: FC<PhotoSwipeGalleryProps> = ({
  items,
  isOpen,
  onClose,
  initialIndex = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const currentItem = items[currentIndex];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCurrentIndex(initialIndex);
    setIsImageLoading(true);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowLeft' && items.length > 1) {
        setCurrentIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
      }

      if (event.key === 'ArrowRight' && items.length > 1) {
        setCurrentIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, items.length, onClose]);

  useEffect(() => {
    if (!isOpen || !currentItem) {
      return;
    }

    setIsImageLoading(true);
  }, [currentIndex, currentItem, isOpen]);

  if (!isOpen || !currentItem) {
    return null;
  }

  const goPrev = () => {
    if (items.length <= 1) {
      return;
    }

    setCurrentIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const goNext = () => {
    if (items.length <= 1) {
      return;
    }

    setCurrentIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 backdrop-blur-sm">
      <button
        type="button"
        aria-label="关闭预览"
        onClick={onClose}
        className="absolute right-6 top-6 z-[110] flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="h-6 w-6" />
      </button>

      {items.length > 1 && (
        <button
          type="button"
          aria-label="上一张"
          onClick={goPrev}
          className="absolute left-6 top-1/2 z-[110] flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}

      <div className="relative flex h-full w-full flex-col items-center justify-center px-20 py-16">
        {isImageLoading && (
          <div className="absolute inset-0 z-[101] flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-full bg-white/10 px-5 py-3 text-sm font-medium text-white">
              <Loader2 className="h-5 w-5 animate-spin" />
              图片加载中
            </div>
          </div>
        )}

        <img
          key={currentItem.id}
          src={currentItem.originalUrl}
          alt={currentItem.name}
          className="max-h-full max-w-full object-contain select-none"
          onLoad={() => setIsImageLoading(false)}
          onError={() => setIsImageLoading(false)}
        />

        <div className="pointer-events-none absolute bottom-6 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/45 px-5 py-3 text-sm text-white">
          <span className="font-medium">{currentItem.name}</span>
          <span className="text-white/60">
            {currentIndex + 1} / {items.length}
          </span>
          {currentItem.width && currentItem.height && (
            <span className="text-white/60">
              {currentItem.width} × {currentItem.height}
            </span>
          )}
        </div>
      </div>

      {items.length > 1 && (
        <button
          type="button"
          aria-label="下一张"
          onClick={goNext}
          className="absolute right-6 top-1/2 z-[110] flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      )}
    </div>
  );
};
