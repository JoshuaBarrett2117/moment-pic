import { useEffect } from 'react';

type UseViewerDesktopControlsInput = {
  isEnabled: boolean;
  isOpen: boolean;
  imageCount: number;
  showEndPrompt: boolean;
  onPrevious: () => void;
  onNext: () => void | Promise<void>;
  onClose: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function useViewerDesktopControls({
  isEnabled,
  isOpen,
  imageCount,
  showEndPrompt,
  onPrevious,
  onNext,
  onClose,
  onZoomIn,
  onZoomOut,
}: UseViewerDesktopControlsInput) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen || imageCount === 0 || showEndPrompt) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        onPrevious();
      } else if (event.key === 'ArrowRight') {
        void onNext();
      } else if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (!isOpen || imageCount === 0) {
        return;
      }

      event.preventDefault();

      if (event.deltaY < 0) {
        onZoomIn();
      } else {
        onZoomOut();
      }
    };

    if (isEnabled) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [imageCount, isEnabled, isOpen, onClose, onNext, onPrevious, onZoomIn, onZoomOut, showEndPrompt]);
}
