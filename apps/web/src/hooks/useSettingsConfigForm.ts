import { useEffect, useState } from 'react';
import { VIEWER_QUALITY_SESSION_KEY } from '../lib/viewer-quality';
import { useSystemConfig } from './useSystemConfig';

const VIEWER_PRELOAD_BEFORE_KEY = 'moment_pic_viewer_preload_before';
const VIEWER_PRELOAD_AFTER_KEY = 'moment_pic_viewer_preload_after';
const DEFAULT_PRELOAD_BEFORE = 2;
const DEFAULT_PRELOAD_AFTER = 3;
const DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_MOBILE = 160;
const DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_DESKTOP = 300;
const DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_MOBILE = 160;
const DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_DESKTOP = 300;
const DEFAULT_IMAGE_QUALITY_PRESET = 'original';

const clampPreloadRadius = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
};

const clampGridWidth = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_MOBILE;
  }

  return Math.max(180, Math.min(600, Math.round(value)));
};

export const useSettingsConfigForm = () => {
  const { systemConfig, updateSystemConfig, ...rest } = useSystemConfig();
  const [preloadBefore, setPreloadBefore] = useState(DEFAULT_PRELOAD_BEFORE);
  const [preloadAfter, setPreloadAfter] = useState(DEFAULT_PRELOAD_AFTER);
  const [defaultImageQualityPreset, setDefaultImageQualityPreset] = useState<'low' | 'balanced' | 'high' | 'original'>(DEFAULT_IMAGE_QUALITY_PRESET);
  const [albumListItemMinWidthMobile, setAlbumListItemMinWidthMobile] = useState(DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_MOBILE);
  const [albumListItemMinWidthDesktop, setAlbumListItemMinWidthDesktop] = useState(DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_DESKTOP);
  const [albumDetailItemMinWidthMobile, setAlbumDetailItemMinWidthMobile] = useState(DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_MOBILE);
  const [albumDetailItemMinWidthDesktop, setAlbumDetailItemMinWidthDesktop] = useState(DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_DESKTOP);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (systemConfig) {
      setPreloadBefore(clampPreloadRadius(systemConfig.preloadBefore));
      setPreloadAfter(clampPreloadRadius(systemConfig.preloadAfter));
      setDefaultImageQualityPreset(systemConfig.defaultImageQualityPreset);
      setAlbumListItemMinWidthMobile(clampGridWidth(systemConfig.albumListItemMinWidthMobile));
      setAlbumListItemMinWidthDesktop(clampGridWidth(systemConfig.albumListItemMinWidthDesktop));
      setAlbumDetailItemMinWidthMobile(clampGridWidth(systemConfig.albumDetailItemMinWidthMobile));
      setAlbumDetailItemMinWidthDesktop(clampGridWidth(systemConfig.albumDetailItemMinWidthDesktop));
      return;
    }

    const savedBefore = window.localStorage.getItem(VIEWER_PRELOAD_BEFORE_KEY);
    const savedAfter = window.localStorage.getItem(VIEWER_PRELOAD_AFTER_KEY);
    setPreloadBefore(clampPreloadRadius(Number(savedBefore ?? DEFAULT_PRELOAD_BEFORE)));
    setPreloadAfter(clampPreloadRadius(Number(savedAfter ?? DEFAULT_PRELOAD_AFTER)));
    setDefaultImageQualityPreset(DEFAULT_IMAGE_QUALITY_PRESET);
    setAlbumListItemMinWidthMobile(DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_MOBILE);
    setAlbumListItemMinWidthDesktop(DEFAULT_ALBUM_LIST_ITEM_MIN_WIDTH_DESKTOP);
    setAlbumDetailItemMinWidthMobile(DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_MOBILE);
    setAlbumDetailItemMinWidthDesktop(DEFAULT_ALBUM_DETAIL_ITEM_MIN_WIDTH_DESKTOP);
  }, [systemConfig]);

  useEffect(() => {
    if (saveStatus !== 'saved') {
      return;
    }

    const timer = window.setTimeout(() => {
      setSaveStatus('idle');
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [saveStatus]);

  const saveConfig = async (updates: Parameters<typeof updateSystemConfig>[0]) => {
    setIsSavingConfig(true);
    setSaveStatus('saving');
    const result = await updateSystemConfig(updates);
    setIsSavingConfig(false);

    if (result) {
      setSaveStatus('saved');
      return true;
    }

    setSaveStatus('error');
    return false;
  };

  const saveDefaultImageQualityPreset = async (nextPreset: 'low' | 'balanced' | 'high' | 'original') => {
    setDefaultImageQualityPreset(nextPreset);
    if (!systemConfig) {
      return false;
    }

    const didSave = await saveConfig({ defaultImageQualityPreset: nextPreset });
    if (didSave && typeof window !== 'undefined') {
      window.sessionStorage.removeItem(VIEWER_QUALITY_SESSION_KEY);
    }

    return didSave;
  };

  const handleViewerPreloadRadiusChange = (value: string, type: 'before' | 'after') => {
    const nextValue = clampPreloadRadius(Number(value));
    if (type === 'before') {
      setPreloadBefore(nextValue);
      window.localStorage.setItem(VIEWER_PRELOAD_BEFORE_KEY, String(nextValue));
      return;
    }

    setPreloadAfter(nextValue);
    window.localStorage.setItem(VIEWER_PRELOAD_AFTER_KEY, String(nextValue));
  };

  return {
    ...rest,
    albumDetailItemMinWidthDesktop,
    albumDetailItemMinWidthMobile,
    albumListItemMinWidthDesktop,
    albumListItemMinWidthMobile,
    defaultImageQualityPreset,
    handleViewerPreloadRadiusChange,
    isSavingConfig,
    preloadAfter,
    preloadBefore,
    saveConfig,
    saveDefaultImageQualityPreset,
    saveStatus,
    setAlbumDetailItemMinWidthDesktop,
    setAlbumDetailItemMinWidthMobile,
    setAlbumListItemMinWidthDesktop,
    setAlbumListItemMinWidthMobile,
    systemConfig
  };
};
