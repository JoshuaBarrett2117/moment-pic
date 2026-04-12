import type { FC } from 'react';
import { useEffect, useState, useCallback } from 'react';
import Viewer from 'react-viewer';
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
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    if (isOpen) {
      setActiveIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  const handleClose = useCallback(() => {
    setActiveIndex(0);
    onClose();
  }, [onClose]);

  const handleMaskClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const images = items.map((item) => ({
    src: item.originalUrl,
    alt: item.name,
    downloadUrl: item.originalUrl,
  }));

  if (!isOpen) {
    return null;
  }

  return (
    <Viewer
      images={images}
      activeIndex={activeIndex}
      visible={isOpen}
      onClose={handleClose}
      onMaskClick={handleMaskClick}
      noClose={false}
      noImgDetails
      noNavbar
      noToolbar
      noFooter
      zoomable
      rotatable
      scalable
      loop
      minScale={0.1}
      maxScale={6}
      zoomSpeed={0.25}
      className="viewer-react"
      zIndex={9999}
      disableMouseScroll={false}
      drag
    />
  );
};
