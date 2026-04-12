import type { FC } from 'react';
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Maximize2, X, Loader2 } from 'lucide-react';
import { useMobile } from '../hooks';
import type { AssetListItemDTO } from '../types/api';

interface ViewerGalleryProps {
  items: AssetListItemDTO[];
  isOpen: boolean;
  onClose: () => void;
  initialIndex?: number;
}

export const ViewerGallery: FC<ViewerGalleryProps> = ({
  items,
  isOpen,
  onClose,
  initialIndex = 0,
}) => {
  const isMobile = useMobile();
  const safeItems = items ?? [];
  
  const images = useMemo(
    () => {
      if (!safeItems || !Array.isArray(safeItems)) {
        return [];
      }
      return safeItems
        .filter((item) => item && item.originalUrl)
        .map((item) => ({
          src: item.originalUrl,
          alt: item.name,
        }));
    },
    [safeItems]
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showControls, setShowControls] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const lastTouchDistance = useRef<number>(0);
  const isZooming = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen && images.length > 0) {
      const validIndex = Math.min(initialIndex, Math.max(0, images.length - 1));
      setActiveIndex(validIndex);
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setIsImageLoading(true);
    }
  }, [isOpen, initialIndex, images.length]);

  useEffect(() => {
    if (isMobile) {
      setShowControls(false);
    }
  }, [isMobile]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || images.length === 0) return;
      
      if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'Escape') {
        handleClose();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!isOpen || images.length === 0) return;
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
  }, [isOpen, images.length, isMobile]);

  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isMobile, isOpen]);

  const goToPrev = useCallback(() => {
    if (images.length === 0) return;
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setIsImageLoading(true);
  }, [images.length]);

  const goToNext = useCallback(() => {
    if (images.length === 0) return;
    setActiveIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setIsImageLoading(true);
  }, [images.length]);

  const handleClose = useCallback(() => {
    setActiveIndex(0);
    setScale(1);
    setRotation(0);
    onClose();
  }, [onClose]);

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
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [scale, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isZooming.current = false;
    } else if (e.touches.length === 2) {
      isZooming.current = true;
      lastTouchDistance.current = getTouchDistance(e.touches);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
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
  }, [scale]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    lastTouchDistance.current = 0;
    
    if (e.touches.length > 0) return;
    if (isZooming.current) return;
    if (!e.changedTouches || !e.changedTouches[0]) return;
    
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const minSwipeDistance = isMobile ? 60 : 50;
    
    if (Math.abs(deltaX) > minSwipeDistance) {
      if (deltaX > 0) {
        goToPrev();
      } else {
        goToNext();
      }
    }
  }, [isMobile, goToPrev, goToNext]);

  const handleImageLoad = useCallback(() => {
    setIsImageLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsImageLoading(false);
  }, []);

  if (!isOpen || images.length === 0) {
    return null;
  }

  const currentImage = images[activeIndex];
  if (!currentImage) {
    return null;
  }

  const btnSize = isMobile ? 64 : 44;
  const toolbarBtnSize = isMobile ? 56 : 44;
  const closeBtnSize = isMobile ? 56 : 48;
  const navBtnSize = isMobile ? 64 : 56;

  const handleImageClick = useCallback(() => {
    if (isMobile) {
      setShowControls((prev) => !prev);
    }
  }, [isMobile]);

  return (
    <div 
      className="fixed inset-0 z-[99999] viewer-gallery flex items-center justify-center bg-black touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => !isMobile && setShowControls(true)}
      onMouseLeave={() => !isMobile && setShowControls(false)}
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
          top: 20px;
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
          top: 20px;
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
          bottom: 30px;
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
          transform: translateY(-30px);
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

      <button 
        className="viewer-close" 
        onClick={handleClose} 
        title="关闭"
        style={{ width: closeBtnSize, height: closeBtnSize }}
      >
        <X size={isMobile ? 28 : 24} />
      </button>

      <button 
        className="viewer-nav-btn prev" 
        onClick={goToPrev} 
        title="上一张"
        style={{ width: navBtnSize, height: navBtnSize }}
      >
        <ChevronLeft size={isMobile ? 44 : 36} />
      </button>

      <button 
        className="viewer-nav-btn next" 
        onClick={goToNext} 
        title="下一张"
        style={{ width: navBtnSize, height: navBtnSize }}
      >
        <ChevronRight size={isMobile ? 44 : 36} />
      </button>

      <div 
        className="viewer-image-container"
        onClick={handleImageClick}
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
          onLoad={handleImageLoad}
          onError={handleImageError}
          draggable={false}
        />
      </div>

      <div className="viewer-counter">
        {activeIndex + 1} / {images.length}
      </div>

      <div className="viewer-toolbar">
        <button 
          className="viewer-btn" 
          onClick={handleZoomOut} 
          title="缩小"
          style={{ width: toolbarBtnSize, height: toolbarBtnSize }}
        >
          <ZoomOut size={isMobile ? 28 : 22} />
        </button>
        <button 
          className="viewer-btn" 
          onClick={handleZoomIn} 
          title="放大"
          style={{ width: toolbarBtnSize, height: toolbarBtnSize }}
        >
          <ZoomIn size={isMobile ? 28 : 22} />
        </button>
        <button 
          className="viewer-btn" 
          onClick={handleRotate} 
          title="旋转"
          style={{ width: toolbarBtnSize, height: toolbarBtnSize }}
        >
          <RotateCw size={isMobile ? 28 : 22} />
        </button>
        <button 
          className="viewer-btn" 
          onClick={handleReset} 
          title="重置"
          style={{ width: toolbarBtnSize, height: toolbarBtnSize }}
        >
          <Maximize2 size={isMobile ? 28 : 22} />
        </button>
      </div>
    </div>
  );
};
