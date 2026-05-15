import type { MouseEventHandler } from 'react';

type ViewerImageStageProps = {
  imageSrc: string;
  alt: string;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  isDragging: boolean;
  isImageLoading: boolean;
  onImageLoadSettled: () => void;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onMouseMove: MouseEventHandler<HTMLDivElement>;
  onMouseUp: MouseEventHandler<HTMLDivElement>;
};

export function ViewerImageStage({
  imageSrc,
  alt,
  position,
  scale,
  rotation,
  isDragging,
  isImageLoading,
  onImageLoadSettled,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}: ViewerImageStageProps) {
  return (
    <div
      className="viewer-image-container"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      data-viewer-state={isImageLoading ? 'loading' : 'ready'}
      style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'pointer' }}
    >
      {isImageLoading && (
        <div className="viewer-loading" data-viewer-loading="true">
          <div className="viewer-loading-spinner" />
        </div>
      )}
      <img
        key={imageSrc}
        src={imageSrc}
        alt={alt}
        className="viewer-image"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
          opacity: isImageLoading ? 0 : 1,
        }}
        onLoad={onImageLoadSettled}
        onError={onImageLoadSettled}
        draggable={false}
      />
    </div>
  );
}
