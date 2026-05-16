import type { ImageQualityPreset } from '../lib/viewer-quality';

export type ViewerImage = {
  id: string;
  originalSrc: string;
};

export const QUALITY_OPTIONS: Array<{ value: ImageQualityPreset; label: string; description: string }> = [
  { value: 'low', label: '省流', description: '打开更快' },
  { value: 'balanced', label: '均衡', description: '默认推荐' },
  { value: 'high', label: '高清', description: '更清晰' },
  { value: 'original', label: '原图', description: '最完整' },
];

export const buildPreviewSrc = (assetId: string, preset: Exclude<ImageQualityPreset, 'original'>): string =>
  `/api/v1/assets/${assetId}/preview?preset=${preset}`;

export const resolveImageSrc = (image: ViewerImage, preset: ImageQualityPreset): string => {
  if (preset === 'original') {
    return image.originalSrc;
  }

  return buildPreviewSrc(image.id, preset);
};

export const resolveViewerInitialIndex = (initialIndex: number, total: number): number | null => {
  if (total <= 0) {
    return null;
  }

  return Math.min(Math.max(0, initialIndex), total - 1);
};

export const resolveViewerIndexAfterImagesChange = (activeIndex: number, total: number): number | null => {
  if (total <= 0) {
    return null;
  }

  return Math.min(Math.max(0, activeIndex), total - 1);
};

export type ViewerNextAction = 'advance' | 'load-more' | 'show-end-prompt' | 'none';

export const resolveViewerNextAction = (input: {
  activeIndex: number;
  total: number;
  hasMoreItems: boolean;
  canRequestMoreItems: boolean;
  isBusy: boolean;
}): ViewerNextAction => {
  if (input.total <= 0) {
    return 'none';
  }

  if (input.activeIndex < input.total - 1) {
    return 'advance';
  }

  if (input.hasMoreItems && input.canRequestMoreItems) {
    return input.isBusy ? 'none' : 'load-more';
  }

  return 'show-end-prompt';
};

export const getQualityLabel = (preset: ImageQualityPreset): string => {
  if (preset === 'low') {
    return '省流';
  }

  if (preset === 'high') {
    return '高清';
  }

  if (preset === 'original') {
    return '原图';
  }

  return '均衡';
};

export const getPreloadHint = (preset: ImageQualityPreset): string | null => {
  if (preset === 'original') {
    return '当前档位已关闭相邻预加载';
  }

  if (preset === 'high') {
    return '当前档位会减少相邻预加载';
  }

  return null;
};

export const resolvePreloadWindow = (input: {
  activeIndex: number;
  total: number;
  preset: ImageQualityPreset;
  preloadBefore: number;
  preloadAfter: number;
}): { start: number; end: number } | null => {
  if (input.total <= 0) {
    return null;
  }

  const effectivePreloadBefore = input.preset === 'original'
    ? 0
    : input.preset === 'high'
      ? Math.min(Math.max(0, input.preloadBefore), 1)
      : Math.max(0, input.preloadBefore);
  const effectivePreloadAfter = input.preset === 'original'
    ? 0
    : input.preset === 'high'
      ? Math.min(Math.max(0, input.preloadAfter), 1)
      : Math.max(0, input.preloadAfter);

  return {
    start: Math.max(0, input.activeIndex - effectivePreloadBefore),
    end: Math.min(input.total - 1, input.activeIndex + effectivePreloadAfter)
  };
};

export const getTouchPointsDistance = (
  first: { clientX: number; clientY: number },
  second: { clientX: number; clientY: number },
): number => {
  const dx = first.clientX - second.clientX;
  const dy = first.clientY - second.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};
