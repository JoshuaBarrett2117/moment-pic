import { type FC, type MouseEvent, type TouchEvent, type TouchList, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Maximize2, X, SlidersHorizontal } from 'lucide-react';
import { useMobile } from '../hooks';
import type { AssetListItemDTO } from '../types/api';

type ImageQualityPreset = 'low' | 'balanced' | 'high' | 'original';
const VIEWER_QUALITY_SESSION_KEY = 'moment_pic_viewer_quality_preset';
const FAST_SWITCH_WINDOW_MS = 220;
const FAST_SWITCH_PRELOAD_COOLDOWN_MS = 1800;

interface ViewerGalleryProps {
  items: AssetListItemDTO[];
  isOpen: boolean;
  onClose: () => void;
  onRequestNextAlbum?: () => void;
  hasMoreItems?: boolean;
  onLoadMoreItems?: () => Promise<boolean> | boolean;
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
  hasMoreItems = false,
  onLoadMoreItems,
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

  const buildPreviewSrc = useCallback((assetId: string, preset: Exclude<ImageQualityPreset, 'original'>) => {
    return `/api/v1/assets/${assetId}/preview?preset=${preset}`;
  }, []);

  const resolveImageSrc = useCallback((
    image: { id: string; originalSrc: string },
    preset: ImageQualityPreset,
  ) => {
    if (preset === 'original') {
      return image.originalSrc;
    }

    return buildPreviewSrc(image.id, preset);
  }, [buildPreviewSrc]);

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
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const lastTouchDistance = useRef<number>(0);
  const isZooming = useRef<boolean>(false);
  const preloadedImagesRef = useRef<HTMLImageElement[]>([]);
  const pendingAdvanceAfterLoadRef = useRef(false);
  const wasOpenRef = useRef(false);
  const lastNavigationAtRef = useRef(0);
  const preloadCooldownUntilRef = useRef(0);

  const cleanupPreloadedImages = useCallback(() => {
    for (const image of preloadedImagesRef.current) {
      image.onload = null;
      image.onerror = null;
      image.src = '';
    }
    preloadedImagesRef.current = [];
  }, []);

  const markNavigation = useCallback(() => {
    const now = Date.now();
    if (now - lastNavigationAtRef.current <= FAST_SWITCH_WINDOW_MS) {
      preloadCooldownUntilRef.current = now + FAST_SWITCH_PRELOAD_COOLDOWN_MS;
    }
    lastNavigationAtRef.current = now;
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setIsImageLoading(true);
  }, []);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current && images.length > 0) {
      const validIndex = Math.min(initialIndex, Math.max(0, images.length - 1));
      const sessionPreset = readSessionQualityPreset();
      setActiveIndex(validIndex);
      setQualityPreset(sessionPreset ?? defaultQualityPreset);
      resetView();
      setShowControls(true);
      setShowQualityPanel(false);
      setShowEndPrompt(false);
    }

    wasOpenRef.current = isOpen;
  }, [defaultQualityPreset, initialIndex, isOpen, images.length, readSessionQualityPreset, resetView]);

  useEffect(() => {
    if (!isOpen || images.length === 0) {
      return;
    }

    setActiveIndex((prev) => Math.min(prev, images.length - 1));
  }, [images.length, isOpen]);

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
      cleanupPreloadedImages();
      return;
    }

    const preloadCoolingDown = Date.now() < preloadCooldownUntilRef.current;
    const effectivePreloadBefore = qualityPreset === 'original'
      ? 0
      : preloadCoolingDown || isImageLoading
        ? 0
      : qualityPreset === 'high'
        ? Math.min(Math.max(0, preloadBefore), 1)
        : Math.max(0, preloadBefore);
    const effectivePreloadAfter = qualityPreset === 'original'
      ? 0
      : preloadCoolingDown || isImageLoading
        ? 0
      : qualityPreset === 'high'
        ? Math.min(Math.max(0, preloadAfter), 1)
        : Math.max(0, preloadAfter);
    const start = Math.max(0, activeIndex - effectivePreloadBefore);
    const end = Math.min(images.length - 1, activeIndex + effectivePreloadAfter);
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

    cleanupPreloadedImages();
    preloadedImagesRef.current = Array.from(urlsToPreload).map((src) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      return image;
    });

    return () => {
      cleanupPreloadedImages();
    };
  }, [activeIndex, cleanupPreloadedImages, images, isImageLoading, isOpen, preloadAfter, preloadBefore, qualityPreset, resolveImageSrc]);

  const goToPrev = useCallback(() => {
    if (images.length === 0) {
      return;
    }

    markNavigation();
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    resetView();
  }, [images.length, markNavigation, resetView]);

  const goToNext = useCallback(() => {
    if (images.length === 0) {
      return;
    }

    markNavigation();
    if (activeIndex >= images.length - 1) {
      if (hasMoreItems && onLoadMoreItems) {
        pendingAdvanceAfterLoadRef.current = true;
        void onLoadMoreItems();
        return;
      }

      setShowEndPrompt(true);
      return;
    }

    setActiveIndex((prev) => prev + 1);
    resetView();
  }, [activeIndex, hasMoreItems, images.length, markNavigation, onLoadMoreItems, resetView]);

  useEffect(() => {
    if (!pendingAdvanceAfterLoadRef.current) {
      return;
    }

    if (isLoadingMoreItems) {
      return;
    }

    pendingAdvanceAfterLoadRef.current = false;

    if (activeIndex < images.length - 1) {
      setActiveIndex((prev) => Math.min(prev + 1, images.length - 1));
      resetView();
      return;
    }

    if (!hasMoreItems) {
      setShowEndPrompt(true);
    }
  }, [activeIndex, hasMoreItems, images.length, isLoadingMoreItems, resetView]);

  const handleClose = useCallback(() => {
    cleanupPreloadedImages();
    setActiveIndex(0);
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setShowQualityPanel(false);
    setShowEndPrompt(false);
    onClose();
  }, [cleanupPreloadedImages, onClose]);

  const handleEnterNextAlbum = useCallback(() => {
    setShowEndPrompt(false);
    onRequestNextAlbum?.();
  }, [onRequestNextAlbum]);

  const handleDismissPrompt = useCallback(() => {
    setShowEndPrompt(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || images.length === 0 || showEndPrompt || isLoadingMoreItems) {
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
  }, [goToNext, goToPrev, handleClose, images.length, isLoadingMoreItems, isMobile, isOpen, showEndPrompt]);

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
  const currentImageSrc = resolveImageSrc(currentImage, qualityPreset);
  const qualityLabel = qualityPreset === 'low' ? '省流' : qualityPreset === 'high' ? '高清' : qualityPreset === 'original' ? '原图' : '均衡';
  const preloadHint = qualityPreset === 'original' ? '当前档位已关闭相邻预加载' : qualityPreset === 'high' ? '当前档位会减少相邻预加载' : null;
  const qualityOptions: Array<{ value: ImageQualityPreset; label: string; description: string }> = [
    { value: 'low', label: '省流', description: '打开更快' },
    { value: 'balanced', label: '均衡', description: '默认推荐' },
    { value: 'high', label: '高清', description: '更清晰' },
    { value: 'original', label: '原图', description: '最完整' },
  ];

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
        .viewer-quality-panel {
          position: fixed;
          bottom: calc(env(safe-area-inset-bottom) + 112px);
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: min(18rem, calc(100vw - 2rem));
          padding: 14px;
          background: rgba(0, 0, 0, 0.82);
          border-radius: 20px;
          backdrop-filter: blur(12px);
          z-index: 21;
          opacity: ${showControls && showQualityPanel ? 1 : 0};
          pointer-events: ${showControls && showQualityPanel ? 'auto' : 'none'};
          transition: all 0.2s;
        }
        .viewer-quality-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          padding: 12px 14px;
          border: none;
          border-radius: 14px;
          color: white;
          background: rgba(255, 255, 255, 0.08);
          cursor: pointer;
          text-align: left;
          transition: background 0.2s;
        }
        .viewer-quality-option:hover {
          background: rgba(255, 255, 255, 0.16);
        }
        .viewer-quality-option[data-active='true'] {
          background: rgba(255, 255, 255, 0.22);
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
        {qualityOptions.map((option) => (
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
