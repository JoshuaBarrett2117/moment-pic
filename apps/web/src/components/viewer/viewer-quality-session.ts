import { type ImageQualityPreset, isImageQualityPreset, VIEWER_QUALITY_SESSION_KEY } from '../../lib/viewer-quality';

export const readViewerQualityPreset = (): ImageQualityPreset | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const savedPreset = window.sessionStorage.getItem(VIEWER_QUALITY_SESSION_KEY);
  return isImageQualityPreset(savedPreset) ? savedPreset : null;
};

/** 只在用户于查看器内手动切换画质时调用；默认值不写入，避免把「默认」误当成手动选择。 */
export const saveViewerQualityPreset = (preset: ImageQualityPreset): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(VIEWER_QUALITY_SESSION_KEY, preset);
};
