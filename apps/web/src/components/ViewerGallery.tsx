import type { FC } from 'react';
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Maximize2, X } from 'lucide-react';
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && images.length > 0) {
      const validIndex = Math.min(initialIndex, Math.max(0, images.length - 1));
      setActiveIndex(validIndex);
      setScale(1);
      setRotation(0);
    }
  }, [isOpen, initialIndex, images.length]);

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
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen, images.length]);

  const goToPrev = useCallback(() => {
    if (images.length === 0) return;
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, [images.length]);

  const goToNext = useCallback(() => {
    if (images.length === 0) return;
    setActiveIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
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

  if (!isOpen || images.length === 0) {
    return null;
  }

  const currentImage = images[activeIndex];
  if (!currentImage) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[99999] viewer-gallery flex items-center justify-center bg-black">
      <style>{`
        .viewer-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          background: rgba(255, 255, 255, 0.15);
          border: none;
          border-radius: 10px;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }
        .viewer-btn:hover {
          background: rgba(255, 255, 255, 0.25);
        }
        .viewer-counter {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          padding: 8px 16px;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 20px;
          color: white;
          font-size: 14px;
          backdrop-filter: blur(10px);
          z-index: 20;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .viewer-gallery:hover .viewer-counter {
          opacity: 1;
        }
        .viewer-close {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 44px;
          height: 44px;
          background: rgba(255, 255, 255, 0.15);
          border: none;
          border-radius: 50%;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
          z-index: 20;
        }
        .viewer-close:hover {
          background: rgba(255, 255, 255, 0.25);
        }
        .viewer-nav-btn {
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
          width: 56px;
          height: 56px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 50%;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
          z-index: 20;
          opacity: 0;
        }
        .viewer-gallery:hover .viewer-nav-btn {
          opacity: 1;
        }
        .viewer-nav-btn.prev {
          left: 20px;
        }
        .viewer-nav-btn.next {
          right: 20px;
        }
        .viewer-nav-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .viewer-toolbar {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          padding: 12px 20px;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 16px;
          backdrop-filter: blur(10px);
          z-index: 20;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .viewer-gallery:hover .viewer-toolbar {
          opacity: 1;
        }
        .viewer-image-container {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .viewer-image {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
          transition: transform 0.2s ease-out;
        }
      `}</style>

      <button className="viewer-close" onClick={handleClose} title="关闭">
        <X size={24} />
      </button>

      <button className="viewer-nav-btn prev" onClick={goToPrev} title="上一张 (←)">
        <ChevronLeft size={32} />
      </button>

      <button className="viewer-nav-btn next" onClick={goToNext} title="下一张 (→)">
        <ChevronRight size={32} />
      </button>

      <div 
        className="viewer-image-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        <img
          src={currentImage.src}
          alt={currentImage.alt}
          className="viewer-image"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
          draggable={false}
        />
      </div>

      <div className="viewer-counter">
        {activeIndex + 1} / {images.length}
      </div>

      <div className="viewer-toolbar">
        <button className="viewer-btn" onClick={handleZoomOut} title="缩小">
          <ZoomOut size={22} />
        </button>
        <button className="viewer-btn" onClick={handleZoomIn} title="放大">
          <ZoomIn size={22} />
        </button>
        <button className="viewer-btn" onClick={handleRotate} title="旋转">
          <RotateCw size={22} />
        </button>
        <button className="viewer-btn" onClick={handleReset} title="重置">
          <Maximize2 size={22} />
        </button>
      </div>
    </div>
  );
};
