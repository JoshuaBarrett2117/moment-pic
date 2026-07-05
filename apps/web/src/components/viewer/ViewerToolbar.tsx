import { Maximize2, RotateCw, SlidersHorizontal, ZoomIn, ZoomOut } from 'lucide-react';

type ViewerToolbarProps = {
  buttonSize: number;
  iconSize: number;
  onToggleQualityPanel: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onRotate: () => void;
  onReset: () => void;
};

export function ViewerToolbar({
  buttonSize,
  iconSize,
  onToggleQualityPanel,
  onZoomOut,
  onZoomIn,
  onRotate,
  onReset,
}: ViewerToolbarProps) {
  return (
    <div className="viewer-toolbar">
      <button
        className="viewer-btn"
        onClick={onToggleQualityPanel}
        title="画质"
        style={{ width: buttonSize, height: buttonSize }}
      >
        <SlidersHorizontal size={iconSize} />
      </button>
      <button className="viewer-btn" onClick={onZoomOut} title="缩小" style={{ width: buttonSize, height: buttonSize }}>
        <ZoomOut size={iconSize} />
      </button>
      <button className="viewer-btn" onClick={onZoomIn} title="放大" style={{ width: buttonSize, height: buttonSize }}>
        <ZoomIn size={iconSize} />
      </button>
      <button className="viewer-btn" onClick={onRotate} title="旋转" style={{ width: buttonSize, height: buttonSize }}>
        <RotateCw size={iconSize} />
      </button>
      <button className="viewer-btn" onClick={onReset} title="重置" style={{ width: buttonSize, height: buttonSize }}>
        <Maximize2 size={iconSize} />
      </button>
    </div>
  );
}
