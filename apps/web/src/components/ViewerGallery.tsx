import { type FC, type MouseEvent, type TouchEvent, type TouchList, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Maximize2, X, SlidersHorizontal } from 'lucide-react';
import { useMobile } from '../hooks';
import type { AssetListItemDTO } from '../types/api';
import { type ImageQualityPreset, VIEWER_QUALITY_SESSION_KEY } from '../lib/viewer-quality';
import { getPreloadHint, getQualityLabel, getTouchPointsDistance, QUALITY_OPTIONS, resolveImageSrc, resolvePreloadWindow } from './viewer-gallery-utils';
import { ViewerGalleryStyles } from './ViewerGalleryStyles';

interface ViewerGalleryProps {
  items: AssetListItemDTO[];
  isOpen: boolean;
  onClose: () => void;
  onRequestNextAlbum?: () => void;
  onRequestMoreItems?: () => Promise<boolean>;
  hasMoreItems?: boolean;
  isLoadingMoreItems?: boolean;
  initialIndex?: number;
  defaultQualityPreset?: ImageQualityPreset;
  preloadBefore?: number;
  preloadAfter?: number;
}

export const ViewerGallery: FC<ViewerGalleryProps> = ({
  items,
  isOpen,
  onClose,
  onRequestNextAlbum,
  onRequestMoreItems,
  hasMoreItems = false,
  isLoadingMoreItems = false,
  initialIndex = 0,
  defaultQualityPreset = 'original',
  preloadBefore = 0,
  preloadAfter = 0,
}) => {
  const isMobile = useMobile();
  const useTouchInteractions = isMobile;
  const safeItems = items ?? [];
  const readSessionQualityPreset = useCallback((): ImageQualityPreset | null => {
    if (typeof window === 'undefined') {
      return null;
    }

    const savedPreset = window.sessionStorage.getItem(VIEWER_QUALITY_SESSION_KEY);
    if (savedPreset === 'low' || savedPreset === 'balanced' || savedPreset === 'high' || savedPreset === 'original') {
      return savedPreset;
    }

    return null;
  }, []);

  const images = useMemo(() => {
    if (!Array.isArray(safeItems)) {
      return [];
    }

    return safeItems
      .filter((item) => item && item.originalUrl)
      .map((item) => ({
        id: item.id,
        originalSrc: item.originalUrl,
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
  const [qualityPreset, setQualityPreset] = useState<ImageQualityPreset>(defaultQualityPreset);
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [isRequestingMoreItems, setIsRequestingMoreItems] = useState(false);
  const [pendingAdvanceAfterLoad, setPendingAdvanceAfterLoad] = useState(false);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchDragStartX = useRef<number>(0);
  const touchDragStartY = useRef<number>(0);
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
      const sessionPreset = readSessionQualityPreset();
      setActiveIndex(validIndex);
      setQualityPreset(sessionPreset ?? defaultQualityPreset);
      resetView();
      setShowControls(true);
      setShowQualityPanel(false);
      setShowEndPrompt(false);
    }
  }, [defaultQualityPreset, initialIndex, isOpen, readSessionQualityPreset, resetView]);

  useEffect(() => {
    if (images.length === 0) {
      return;
    }

    setActiveIndex((prev) => Math.min(prev, images.length - 1));
  }, [images.length]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(VIEWER_QUALITY_SESSION_KEY, qualityPreset);
  }, [qualityPreset]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setIsImageLoading(true);
    setShowQualityPanel(false);
  }, [activeIndex, isOpen, qualityPreset]);

  useEffect(() => {
    if (!isOpen || images.length === 0) {
      preloadedImagesRef.current = [];
      return;
    }

    const preloadWindow = resolvePreloadWindow({
      activeIndex,
      total: images.length,
      preset: qualityPreset,
      preloadBefore,
      preloadAfter,
    });
    if (!preloadWindow) {
      preloadedImagesRef.current = [];
      return;
    }

    const { start, end } = preloadWindow;
    const urlsToPreload = new Set<string>();

    for (let index = start; index <= end; index += 1) {
      if (index === activeIndex) {
        continue;
      }

      const target = images[index];
      if (target) {
        urlsToPreload.add(resolveImageSrc(target, qualityPreset));
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
  }, [activeIndex, images, isOpen, preloadAfter, preloadBefore, qualityPreset]);

  const goToPrev = useCallback(() => {
    if (images.length === 0) {
      return;
    }

    setActiveIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    resetView();
  }, [images.length, resetView]);

  const goToNext = useCallback(async () => {
    if (images.length === 0) {
      return;
    }

    if (activeIndex < images.length - 1) {
      setActiveIndex((prev) => prev + 1);
      resetView();
      return;
    }

    if (hasMoreItems && onRequestMoreItems) {
      if (isLoadingMoreItems || isRequestingMoreItems) {
        return;
      }

      setPendingAdvanceAfterLoad(true);
      setIsRequestingMoreItems(true);
      setShowEndPrompt(false);

      try {
        const didLoadMore = await onRequestMoreItems();
        if (!didLoadMore) {
          setPendingAdvanceAfterLoad(false);
          setShowEndPrompt(true);
        }
      } catch {
        setPendingAdvanceAfterLoad(false);
        setShowEndPrompt(true);
      } finally {
        setIsRequestingMoreItems(false);
      }

      return;
    }

    setShowEndPrompt(true);
  }, [activeIndex, hasMoreItems, images.length, isLoadingMoreItems, isRequestingMoreItems, onRequestMoreItems, resetView]);

  const handleClose = useCallback(() => {
    setActiveIndex(0);
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setShowQualityPanel(false);
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

  useEffect(() => {
    if (!showControls) {
      setShowQualityPanel(false);
    }
  }, [showControls]);

  useEffect(() => {
    if (!pendingAdvanceAfterLoad) {
      return;
    }

    if (activeIndex < images.length - 1) {
      setPendingAdvanceAfterLoad(false);
      setActiveIndex((prev) => Math.min(prev + 1, images.length - 1));
      resetView();
    }
  }, [activeIndex, images.length, pendingAdvanceAfterLoad, resetView]);

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

    return getTouchPointsDistance(touches[0], touches[1]);
  };

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (showEndPrompt) {
      return;
    }

    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchDragStartX.current = e.touches[0].clientX - position.x;
      touchDragStartY.current = e.touches[0].clientY - position.y;
      isZooming.current = false;
      setIsDragging(scale > 1);
    } else if (e.touches.length === 2) {
      isZooming.current = true;
      setIsDragging(false);
      lastTouchDistance.current = getTouchDistance(e.touches);
    }
  }, [position, scale, showEndPrompt]);

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

      if (scale > 1) {
        e.preventDefault();
        setPosition({
          x: e.touches[0].clientX - touchDragStartX.current,
          y: e.touches[0].clientY - touchDragStartY.current,
        });

        if (deltaX > 2 || deltaY > 2) {
          isZooming.current = true;
        }
      } else if (deltaY > deltaX) {
        isZooming.current = true;
      }
    }
  }, [scale, showEndPrompt]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (showEndPrompt) {
      return;
    }

    lastTouchDistance.current = 0;

    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchDragStartX.current = e.touches[0].clientX - position.x;
      touchDragStartY.current = e.touches[0].clientY - position.y;
      setIsDragging(scale > 1);
      return;
    }

    setIsDragging(false);

    if (isZooming.current || !e.changedTouches?.[0]) {
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
  }, [goToNext, goToPrev, position, scale, showEndPrompt, useTouchInteractions]);

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
  const currentImageSrc = resolveImageSrc(currentImage, qualityPreset);
  const qualityLabel = getQualityLabel(qualityPreset);
  const preloadHint = getPreloadHint(qualityPreset);
  return (
    <div
      className="viewer-gallery fixed inset-0 z-[99999] flex items-center justify-center bg-black touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => !useTouchInteractions && !showEndPrompt && setShowControls(true)}
      onMouseLeave={() => !useTouchInteractions && !showEndPrompt && setShowControls(false)}
    >
      <ViewerGalleryStyles showControls={showControls} showQualityPanel={showQualityPanel} />

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
        data-viewer-state={isImageLoading ? 'loading' : 'ready'}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'pointer' }}
      >
        {isImageLoading && (
          <div className="viewer-loading" data-viewer-loading="true">
            <div className="viewer-loading-spinner" />
          </div>
        )}
        <img
          key={currentImageSrc}
          src={currentImageSrc}
          alt={currentImage.alt}
          className="viewer-image"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            opacity: isImageLoading ? 0 : 1,
          }}
          onLoad={() => setIsImageLoading(false)}
          onError={() => setIsImageLoading(false)}
          draggable={false}
        />
      </div>

      <div className="viewer-counter">
        {activeIndex + 1} / {images.length} · {qualityLabel}
      </div>

      {preloadHint && showControls && (
        <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.8rem)] z-20 -translate-x-1/2 rounded-full bg-white/12 px-4 py-2 text-xs text-white/90 backdrop-blur-md">
          {preloadHint}
        </div>
      )}

      {useTouchInteractions && showControls && (
        <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+7.3rem)] z-20 -translate-x-1/2 rounded-full bg-white/12 px-4 py-2 text-xs text-white/90 backdrop-blur-md">
          左右滑动切换，点按图片显示或隐藏工具栏
        </div>
      )}

      <div className="viewer-quality-panel">
        {QUALITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            className="viewer-quality-option"
            data-active={option.value === qualityPreset}
            onClick={() => setQualityPreset(option.value)}
            title={option.label}
          >
            <span>{option.label}</span>
            <span className="text-xs text-white/70">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="viewer-toolbar">
        <button
          className="viewer-btn"
          onClick={() => setShowQualityPanel((prev) => !prev)}
          title="画质"
          style={{ width: toolbarBtnSize, height: toolbarBtnSize }}
        >
          <SlidersHorizontal size={isMobile ? 24 : 20} />
        </button>
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