import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useMobile } from '../hooks';
import type { AssetListItemDTO } from '../types/api';
import { type ImageQualityPreset } from '../lib/viewer-quality';
import {
  getPreloadHint,
  getQualityLabel,
  QUALITY_OPTIONS,
  resolveImageSrc,
  resolveViewerIndexAfterImagesChange,
  resolveViewerInitialIndex,
} from './viewer-gallery-utils';
import { ViewerGalleryStyles } from './ViewerGalleryStyles';
import { ViewerEndPrompt } from './viewer/ViewerEndPrompt';
import { ViewerImageStage } from './viewer/ViewerImageStage';
import { ViewerToolbar } from './viewer/ViewerToolbar';
import { readViewerQualityPreset, saveViewerQualityPreset } from './viewer/viewer-quality-session';
import { useViewerDesktopControls } from './viewer/useViewerDesktopControls';
import { useViewerGestures } from './viewer/useViewerGestures';
import { useViewerPreloader } from './viewer/useViewerPreloader';

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
  const [showControls, setShowControls] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [showEndPrompt, setShowEndPrompt] = useState(false);
  const [qualityPreset, setQualityPreset] = useState<ImageQualityPreset>(defaultQualityPreset);
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [isRequestingMoreItems, setIsRequestingMoreItems] = useState(false);
  const [pendingAdvanceAfterLoad, setPendingAdvanceAfterLoad] = useState(false);
  const resetViewRef = useRef<() => void>(() => undefined);
  const hasInitializedOpenSessionRef = useRef(false);

  const handleImageLoadingReset = useCallback(() => {
    setIsImageLoading(true);
  }, []);

  const goToPrev = useCallback(() => {
    if (images.length === 0) {
      return;
    }

    setActiveIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    resetViewRef.current();
  }, [images.length]);

  const goToNext = useCallback(async () => {
    if (images.length === 0) {
      return;
    }

    if (activeIndex < images.length - 1) {
      setActiveIndex((prev) => prev + 1);
      resetViewRef.current();
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
  }, [activeIndex, hasMoreItems, images.length, isLoadingMoreItems, isRequestingMoreItems, onRequestMoreItems]);

  const {
    viewState: { scale, rotation, position, isDragging },
    resetView,
    handleZoomIn,
    handleZoomOut,
    handleWheelZoomIn,
    handleWheelZoomOut,
    handleRotate,
    stageHandlers,
    rootTouchHandlers,
  } = useViewerGestures({
    showEndPrompt,
    useTouchInteractions,
    onPrevious: goToPrev,
    onNext: goToNext,
    onToggleControls: () => setShowControls((prev) => !prev),
    onImageLoadingReset: handleImageLoadingReset,
  });

  resetViewRef.current = resetView;

  useEffect(() => {
    if (!isOpen) {
      hasInitializedOpenSessionRef.current = false;
      return;
    }

    if (hasInitializedOpenSessionRef.current) {
      return;
    }

    const validIndex = resolveViewerInitialIndex(initialIndex, images.length);
    if (validIndex === null) {
      return;
    }

    const sessionPreset = readViewerQualityPreset();
    setActiveIndex(validIndex);
    setQualityPreset(sessionPreset ?? defaultQualityPreset);
    resetView();
    setShowControls(true);
    setShowQualityPanel(false);
    setShowEndPrompt(false);
    hasInitializedOpenSessionRef.current = true;
  }, [defaultQualityPreset, images.length, initialIndex, isOpen, resetView]);

  useEffect(() => {
    if (images.length === 0) {
      return;
    }

    setActiveIndex((prev) => resolveViewerIndexAfterImagesChange(prev, images.length) ?? prev);
  }, [images.length]);

  useEffect(() => {
    saveViewerQualityPreset(qualityPreset);
  }, [qualityPreset]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setIsImageLoading(true);
    setShowQualityPanel(false);
  }, [activeIndex, isOpen, qualityPreset]);

  const handleEnterNextAlbum = useCallback(() => {
    setShowEndPrompt(false);
    onRequestNextAlbum?.();
  }, [onRequestNextAlbum]);

  const handleDismissPrompt = useCallback(() => {
    setShowEndPrompt(false);
  }, []);

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

  const handleClose = useCallback(() => {
    setActiveIndex(0);
    resetView();
    setShowQualityPanel(false);
    setShowEndPrompt(false);
    onClose();
  }, [onClose, resetView]);

  useViewerPreloader({
    isOpen,
    images,
    activeIndex,
    qualityPreset,
    preloadBefore,
    preloadAfter,
  });

  useViewerDesktopControls({
    isEnabled: !isMobile,
    isOpen,
    imageCount: images.length,
    showEndPrompt,
    onPrevious: goToPrev,
    onNext: goToNext,
    onClose: handleClose,
    onZoomIn: handleWheelZoomIn,
    onZoomOut: handleWheelZoomOut,
  });

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
      {...rootTouchHandlers}
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

      <ViewerImageStage
        imageSrc={currentImageSrc}
        alt={currentImage.alt}
        position={position}
        scale={scale}
        rotation={rotation}
        isDragging={isDragging}
        isImageLoading={isImageLoading}
        onImageLoadSettled={() => setIsImageLoading(false)}
        {...stageHandlers}
      />

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

      <ViewerToolbar
        buttonSize={toolbarBtnSize}
        iconSize={isMobile ? 28 : 22}
        onToggleQualityPanel={() => setShowQualityPanel((prev) => !prev)}
        onZoomOut={handleZoomOut}
        onZoomIn={handleZoomIn}
        onRotate={handleRotate}
        onReset={resetView}
      />

      {!useTouchInteractions && showControls && (
        <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+7.5rem)] left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/12 px-4 py-2 text-xs text-white/90 backdrop-blur-md">
          Esc 关闭 · ←→ 切换 · 滚轮缩放
        </div>
      )}

      {showEndPrompt && (
        <ViewerEndPrompt
          canRequestNextAlbum={Boolean(onRequestNextAlbum)}
          onDismiss={handleDismissPrompt}
          onEnterNextAlbum={handleEnterNextAlbum}
        />
      )}
    </div>
  );
};
