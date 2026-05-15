import { type MouseEventHandler, type TouchEventHandler, type TouchList, useCallback, useRef, useState } from 'react';
import { getTouchPointsDistance } from '../viewer-gallery-utils';

type ViewerPosition = {
  x: number;
  y: number;
};

type UseViewerGesturesInput = {
  showEndPrompt: boolean;
  useTouchInteractions: boolean;
  onPrevious: () => void;
  onNext: () => void | Promise<void>;
  onToggleControls: () => void;
  onImageLoadingReset: () => void;
};

type ViewerStageHandlers = {
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onMouseMove: MouseEventHandler<HTMLDivElement>;
  onMouseUp: MouseEventHandler<HTMLDivElement>;
};

type ViewerRootTouchHandlers = {
  onTouchStart: TouchEventHandler<HTMLDivElement>;
  onTouchMove: TouchEventHandler<HTMLDivElement>;
  onTouchEnd: TouchEventHandler<HTMLDivElement>;
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 6;

const clampScale = (value: number) => Math.min(Math.max(value, MIN_SCALE), MAX_SCALE);

const getTouchDistance = (touches: TouchList) => {
  if (touches.length < 2) {
    return 0;
  }

  return getTouchPointsDistance(touches[0], touches[1]);
};

export function useViewerGestures({
  showEndPrompt,
  useTouchInteractions,
  onPrevious,
  onNext,
  onToggleControls,
  onImageLoadingReset,
}: UseViewerGesturesInput) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState<ViewerPosition>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<ViewerPosition>({ x: 0, y: 0 });
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchDragStartX = useRef<number>(0);
  const touchDragStartY = useRef<number>(0);
  const lastTouchDistance = useRef<number>(0);
  const isZooming = useRef<boolean>(false);

  const resetView = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    onImageLoadingReset();
  }, [onImageLoadingReset]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => clampScale(prev * 1.2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => clampScale(prev / 1.2));
  }, []);

  const handleWheelZoomIn = useCallback(() => {
    setScale((prev) => clampScale(prev * 1.1));
  }, []);

  const handleWheelZoomOut = useCallback(() => {
    setScale((prev) => clampScale(prev / 1.1));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleMouseDown = useCallback<MouseEventHandler<HTMLDivElement>>((event) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: event.clientX - position.x, y: event.clientY - position.y });
    }
  }, [position, scale]);

  const handleMouseMove = useCallback<MouseEventHandler<HTMLDivElement>>((event) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: event.clientX - dragStart.x,
        y: event.clientY - dragStart.y,
      });
    }
  }, [dragStart, isDragging, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback<TouchEventHandler<HTMLDivElement>>((event) => {
    if (showEndPrompt) {
      return;
    }

    if (event.touches.length === 1) {
      touchStartX.current = event.touches[0].clientX;
      touchStartY.current = event.touches[0].clientY;
      touchDragStartX.current = event.touches[0].clientX - position.x;
      touchDragStartY.current = event.touches[0].clientY - position.y;
      isZooming.current = false;
      setIsDragging(scale > 1);
    } else if (event.touches.length === 2) {
      isZooming.current = true;
      setIsDragging(false);
      lastTouchDistance.current = getTouchDistance(event.touches);
    }
  }, [position, scale, showEndPrompt]);

  const handleTouchMove = useCallback<TouchEventHandler<HTMLDivElement>>((event) => {
    if (showEndPrompt) {
      return;
    }

    if (event.touches.length === 2) {
      event.preventDefault();
      isZooming.current = true;
      const distance = getTouchDistance(event.touches);
      if (lastTouchDistance.current > 0) {
        const scaleChange = distance / lastTouchDistance.current;
        setScale((prev) => clampScale(prev * scaleChange));
      }
      lastTouchDistance.current = distance;
    } else if (event.touches.length === 1) {
      const deltaX = Math.abs(event.touches[0].clientX - touchStartX.current);
      const deltaY = Math.abs(event.touches[0].clientY - touchStartY.current);

      if (scale > 1) {
        event.preventDefault();
        setPosition({
          x: event.touches[0].clientX - touchDragStartX.current,
          y: event.touches[0].clientY - touchDragStartY.current,
        });

        if (deltaX > 2 || deltaY > 2) {
          isZooming.current = true;
        }
      } else if (deltaY > deltaX) {
        isZooming.current = true;
      }
    }
  }, [scale, showEndPrompt]);

  const handleTouchEnd = useCallback<TouchEventHandler<HTMLDivElement>>((event) => {
    if (showEndPrompt) {
      return;
    }

    lastTouchDistance.current = 0;

    if (event.touches.length === 1) {
      touchStartX.current = event.touches[0].clientX;
      touchStartY.current = event.touches[0].clientY;
      touchDragStartX.current = event.touches[0].clientX - position.x;
      touchDragStartY.current = event.touches[0].clientY - position.y;
      setIsDragging(scale > 1);
      return;
    }

    setIsDragging(false);

    if (isZooming.current || !event.changedTouches?.[0]) {
      return;
    }

    const touchTarget = event.target as HTMLElement | null;
    if (touchTarget?.closest('button')) {
      return;
    }

    const deltaX = event.changedTouches[0].clientX - touchStartX.current;
    const minSwipeDistance = useTouchInteractions ? 60 : 50;

    if (Math.abs(deltaX) > minSwipeDistance) {
      if (deltaX > 0) {
        onPrevious();
      } else {
        void onNext();
      }
      return;
    }

    if (useTouchInteractions) {
      onToggleControls();
    }
  }, [onNext, onPrevious, onToggleControls, position, scale, showEndPrompt, useTouchInteractions]);

  return {
    viewState: {
      scale,
      rotation,
      position,
      isDragging,
    },
    resetView,
    handleZoomIn,
    handleZoomOut,
    handleWheelZoomIn,
    handleWheelZoomOut,
    handleRotate,
    stageHandlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
    } satisfies ViewerStageHandlers,
    rootTouchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    } satisfies ViewerRootTouchHandlers,
  };
}
