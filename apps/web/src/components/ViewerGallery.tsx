import { type FC, type MouseEvent, type TouchEvent, type TouchList, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Maximize2, X } from 'lucide-react';
import { useMobile } from '../hooks';
import type { AssetListItemDTO } from '../types/api';

interface ViewerGalleryProps {
  items: AssetListItemDTO[];
  isOpen: boolean;
  onClose: () => void;
  onRequestNextAlbum?: () => void;
  initialIndex?: number;
  preloadBefore?: number;
  preloadAfter?: number;
}

export const ViewerGallery: FC<ViewerGalleryProps> = ({
  items,
  isOpen,
  onClose,
  onRequestNextAlbum,
  initialIndex = 0,
  preloadBefore = 0,
  preloadAfter = 0,
}) => {
  const isMobile = useMobile();
  const useTouchInteractions = isMobile;
  const safeItems = items ?? [];

  const images = useMemo(() => {
    if (!Array.isArray(safeItems)) {
      return [];
    }

    return safeItems
      .filter((item) => item && item.originalUrl)
      .map((item) => ({
        src: item.originalUrl,
        alt: item.name,
      }));
  }, [safeItems]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showControls, setShowControls] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [showEndPrompt, setShowEndPrompt] = useState(false);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const lastTouchDistance = useRef<number>(0);
  const isZooming = useRef<boolean>(false);
  const preloadedImagesRef = useRef<HTMLImageElement[]>([]);

  const resetView = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setIsImageLoading(true);
  }, []);

  useEffect(() => {
    if (isOpen && images.length > 0) {
      const validIndex = Math.min(initialIndex, Math.max(0, images.length - 1));
      setActiveIndex(validIndex);
      resetView();
      setShowControls(true);
      setShowEndPrompt(false);
    }
  }, [isOpen, initialIndex, images.length, resetView]);

  useEffect(() => {
    if (!isOpen || images.length === 0) {
      preloadedImagesRef.current = [];
      return;
    }

    const start = Math.max(0, activeIndex - Math.max(0, preloadBefore));
    const end = Math.min(images.length - 1, activeIndex + Math.max(0, preloadAfter));
    const urlsToPreload = new Set<string>();

    for (let index = start; index <= end; index += 1) {
      if (index === activeIndex) {
        continue;
      }

      const target = images[index];
      if (target?.src) {
        urlsToPreload.add(target.src);
      }
    }

    preloadedImagesRef.current = Array.from(urlsToPreload).map((src) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      return image;
    });

    return () => {
      preloadedImagesRef.current = [];
    };
  }, [activeIndex, images, isOpen, preloadAfter, preloadBefore]);

  const goToPrev = useCallback(() => {
    if (images.length === 0) {
      return;
    }

    setActiveIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    resetView();
  }, [images.length, resetView]);

  const goToNext = useCallback(() => {
    if (images.length === 0) {
      return;
    }

    if (activeIndex >= images.length - 1) {
      setShowEndPrompt(true);
      return;
    }

    setActiveIndex((prev) => prev + 1);
    resetView();
  }, [activeIndex, images.length, resetView]);

  const handleClose = useCallback(() => {
    setActiveIndex(0);
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setShowEndPrompt(false);
    onClose();
  }, [onClose]);

  const handleEnterNextAlbum = useCallback(() => {
    setShowEndPrompt(false);
    onRequestNextAlbum?.();
  }, [onRequestNextAlbum]);

  const handleDismissPrompt = useCallback(() => {
    setShowEndPrompt(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || images.length === 0 || showEndPrompt) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'Escape') {
        handleClose();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!isOpen || images.length === 0) {
        return;
      }

      e.preventDefault();

      if (e.deltaY < 0) {
        setScale((prev) => Math.min(prev * 1.1, 6));
      } else {
        setScale((prev) => Math.max(prev / 1.1, 0.1));
      }
    };

    if (!isMobile) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [goToNext, goToPrev, handleClose, images.length, isMobile, isOpen, showEndPrompt]);

  useEffect(() => {
    if (!useTouchInteractions || !isOpen) {
      return;
    }

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, useTouchInteractions]);

  useEffect(() => {
    if (!useTouchInteractions || !isOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowControls(false);
    }, 2400);

    return () => {
      clearTimeout(timer);
    };
  }, [activeIndex, isOpen, useTouchInteractions]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev * 1.2, 6));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev / 1.2, 0.1));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setIsImageLoading(true);
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [position, scale]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [dragStart, isDragging, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const getTouchDistance = (touches: TouchList) => {
    if (touches.length < 2) {
      return 0;
    }

    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (showEndPrompt) {
      return;
    }

    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isZooming.current = false;
    } else if (e.touches.length === 2) {
      isZooming.current = true;
      lastTouchDistance.current = getTouchDistance(e.touches);
    }
  }, [showEndPrompt]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (showEndPrompt) {
      return;
    }

    if (e.touches.length === 2) {
      e.preventDefault();
      isZooming.current = true;
      const distance = getTouchDistance(e.touches);
      if (lastTouchDistance.current > 0) {
        const scaleChange = distance / lastTouchDistance.current;
        setScale((prev) => Math.min(Math.max(prev * scaleChange, 0.1), 6));
      }
      lastTouchDistance.current = distance;
    } else if (e.touches.length === 1) {
      const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);

      if (deltaY > deltaX && scale <= 1) {
        isZooming.current = true;
      }
    }
  }, [scale, showEndPrompt]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (showEndPrompt) {
      return;
    }

    lastTouchDistance.current = 0;

    if (e.touches.length > 0 || isZooming.current || !e.changedTouches?.[0]) {
      return;
    }

    const touchTarget = e.target as HTMLElement | null;
    if (touchTarget?.closest('button')) {
      return;
    }

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const minSwipeDistance = useTouchInteractions ? 60 : 50;

    if (Math.abs(deltaX) > minSwipeDistance) {
      if (deltaX > 0) {
        goToPrev();
      } else {
        goToNext();
      }
      return;
    }

    if (useTouchInteractions) {
      setShowControls((prev) => !prev);
    }
  }, [goToNext, goToPrev, showEndPrompt, useTouchInteractions]);

  if (!isOpen || images.length === 0) {
    return null;
  }

  const currentImage = images[activeIndex];
  if (!currentImage) {
    return null;
  }

  const toolbarBtnSize = isMobile ? 56 : 44;
  const closeBtnSize = isMobile ? 56 : 48;
  const navBtnSize = isMobile ? 64 : 56;

  return (
    <div
      className="viewer-gallery fixed inset-0 z-[99999] flex items-center justify-center bg-black touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => !useTouchInteractions && !showEndPrompt && setShowControls(true)}
      onMouseLeave={() => !useTouchInteractions && !showEndPrompt && setShowControls(false)}
    >
      <style>{`
        .viewer-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 12px;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }
        .viewer-btn:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        .viewer-btn:active {
          transform: scale(0.95);
          background: rgba(255, 255, 255, 0.4);
        }
        .viewer-counter {
          position: fixed;
          top: calc(env(safe-area-inset-top) + 20px);
          left: 50%;
          transform: translateX(-50%) translateY(${showControls ? '-10px' : '0'});
          padding: 10px 20px;
          background: rgba(0, 0, 0, 0.7);
          border-radius: 24px;
          color: white;
          font-size: 15px;
          font-weight: 500;
          backdrop-filter: blur(10px);
          z-index: 20;
          opacity: ${showControls ? 1 : 0};
          transition: all 0.3s;
        }
        .viewer-close {
          position: fixed;
          top: calc(env(safe-area-inset-top) + 20px);
          right: 20px;
          transform: translateY(${showControls ? '-10px' : '0'});
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 50%;
          color: white;
          cursor: pointer;
          transition: all 0.3s;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: center;
          -webkit-tap-highlight-color: transparent;
        }
        .viewer-close:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        .viewer-close:active {
          transform: scale(0.95);
        }
        .viewer-nav-btn {
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(255, 255, 255, 0.15);
          border: none;
          border-radius: 50%;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: center;
          -webkit-tap-highlight-color: transparent;
          opacity: ${showControls ? 1 : 0};
        }
        .viewer-nav-btn.prev {
          left: 12px;
        }
        .viewer-nav-btn.next {
          right: 12px;
        }
        .viewer-nav-btn:hover {
          background: rgba(255, 255, 255, 0.25);
        }
        .viewer-nav-btn:active {
          transform: translateY(-50%) scale(0.95);
          background: rgba(255, 255, 255, 0.35);
        }
        .viewer-toolbar {
          position: fixed;
          bottom: calc(env(safe-area-inset-bottom) + 24px);
          left: 50%;
          transform: translateX(-50%) translateY(${showControls ? '-20px' : '0'});
          display: flex;
          gap: 12px;
          padding: 16px 24px;
          background: rgba(0, 0, 0, 0.7);
          border-radius: 20px;
          backdrop-filter: blur(12px);
          z-index: 20;
          opacity: ${showControls ? 1 : 0};
          transition: all 0.3s;
        }
        .viewer-image-container {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s;
        }
        .viewer-image {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
          transition: transform 0.15s ease-out;
        }
        .viewer-loading {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.5);
        }
        .viewer-loading-spinner {
          width: 48px;
          height: 48px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <button className="viewer-close" onClick={handleClose} title="关闭" style={{ width: closeBtnSize, height: closeBtnSize }}>
        <X size={isMobile ? 28 : 24} />
      </button>

      <button className="viewer-nav-btn prev" onClick={goToPrev} title="上一张" style={{ width: navBtnSize, height: navBtnSize }}>
        <ChevronLeft size={isMobile ? 44 : 36} />
      </button>

      <button className="viewer-nav-btn next" onClick={goToNext} title="下一张" style={{ width: navBtnSize, height: navBtnSize }}>
        <ChevronRight size={isMobile ? 44 : 36} />
      </button>

      <div
        className="viewer-image-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'pointer' }}
      >
        {isImageLoading && (
          <div className="viewer-loading">
            <div className="viewer-loading-spinner" />
          </div>
        )}
        <img
          src={currentImage.src}
          alt={currentImage.alt}
          className="viewer-image"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
          onLoad={() => setIsImageLoading(false)}
          onError={() => setIsImageLoading(false)}
          draggable={false}
        />
      </div>

      <div className="viewer-counter">
        {activeIndex + 1} / {images.length}
      </div>

      {useTouchInteractions && showControls && (
        <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 -translate-x-1/2 rounded-full bg-white/12 px-4 py-2 text-xs text-white/90 backdrop-blur-md">
          左右滑动切换，点按图片显示或隐藏工具栏
        </div>
      )}

      <div className="viewer-toolbar">
        <button className="viewer-btn" onClick={handleZoomOut} title="缩小" style={{ width: toolbarBtnSize, height: toolbarBtnSize }}>
          <ZoomOut size={isMobile ? 28 : 22} />
        </button>
        <button className="viewer-btn" onClick={handleZoomIn} title="放大" style={{ width: toolbarBtnSize, height: toolbarBtnSize }}>
          <ZoomIn size={isMobile ? 28 : 22} />
        </button>
        <button className="viewer-btn" onClick={handleRotate} title="旋转" style={{ width: toolbarBtnSize, height: toolbarBtnSize }}>
          <RotateCw size={isMobile ? 28 : 22} />
        </button>
        <button className="viewer-btn" onClick={handleReset} title="重置" style={{ width: toolbarBtnSize, height: toolbarBtnSize }}>
          <Maximize2 size={isMobile ? 28 : 22} />
        </button>
      </div>

      {!useTouchInteractions && showControls && (
        <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+7.5rem)] left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/12 px-4 py-2 text-xs text-white/90 backdrop-blur-md">
          Esc 关闭 · ←→ 切换 · 滚轮缩放
        </div>
      )}

      {showEndPrompt && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#171717] p-6 shadow-2xl">
            <h3 className="font-headline text-xl font-black text-white">当前图集已经结束</h3>
            <p className="mt-3 text-sm leading-6 text-white/75">是否进入下一个图集继续浏览？</p>
            <div className="mt-6 flex justify-end gap-3">
              {onRequestNextAlbum ? (
                <>
                  <button
                    onClick={handleDismissPrompt}
                    className="rounded-full px-4 py-2 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleEnterNextAlbum}
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-all hover:brightness-95"
                  >
                    进入下一个图集
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDismissPrompt}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-all hover:brightness-95"
                >
                  知道了
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
