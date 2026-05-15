import { type ImageQualityPreset, VIEWER_QUALITY_SESSION_KEY } from '../../lib/viewer-quality';

export const readViewerQualityPreset = (): ImageQualityPreset | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const savedPreset = window.sessionStorage.getItem(VIEWER_QUALITY_SESSION_KEY);
  if (savedPreset === 'low' || savedPreset === 'balanced' || savedPreset === 'high' || savedPreset === 'original') {
    return savedPreset;
  }

  return null;
};

export const saveViewerQualityPreset = (preset: ImageQualityPreset): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(VIEWER_QUALITY_SESSION_KEY, preset);
};
