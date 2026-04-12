import type { FC } from 'react';
import { useEffect, useRef } from 'react';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import PhotoSwipe from 'photoswipe';
import 'photoswipe/style.css';
import type { AssetListItemDTO, SystemConfigDTO } from '../types/api';
import { api } from '../lib/api';

interface PhotoSwipeGalleryProps {
  items: AssetListItemDTO[];
  isOpen: boolean;
  onClose: () => void;
  initialIndex?: number;
}

const VIEWER_PRELOAD_BEFORE_KEY = 'moment_pic_viewer_preload_before';
const VIEWER_PRELOAD_AFTER_KEY = 'moment_pic_viewer_preload_after';
const DEFAULT_PRELOAD_BEFORE = 2;
const DEFAULT_PRELOAD_AFTER = 3;
const DEFAULT_FALLBACK_WIDTH = 1600;
const DEFAULT_FALLBACK_HEIGHT = 1200;

interface PreloadConfig {
  before: number;
  after: number;
}

const clampPreload = (value: number, fallback: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;

const toSlideSize = (value: number | null | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

const hasValidSlideSize = (width: number | null | undefined, height: number | null | undefined) =>
  typeof width === 'number' &&
  Number.isFinite(width) &&
  width > 0 &&
  typeof height === 'number' &&
  Number.isFinite(height) &&
  height > 0;

const probeImageNaturalSize = (src: string): Promise<{ width: number; height: number } | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (hasValidSlideSize(img.naturalWidth, img.naturalHeight)) {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
        return;
      }
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

const getCachedPreloadConfig = (): PreloadConfig => {
  const savedBefore = Number(window.localStorage.getItem(VIEWER_PRELOAD_BEFORE_KEY));
  const savedAfter = Number(window.localStorage.getItem(VIEWER_PRELOAD_AFTER_KEY));
  return {
    before: clampPreload(savedBefore, DEFAULT_PRELOAD_BEFORE),
    after: clampPreload(savedAfter, DEFAULT_PRELOAD_AFTER),
  };
};

const syncPreloadConfigInBackground = async () => {
  try {
    const config = await api.get<SystemConfigDTO>('/system-config');
    const before = clampPreload(config.preloadBefore, DEFAULT_PRELOAD_BEFORE);
    const after = clampPreload(config.preloadAfter, DEFAULT_PRELOAD_AFTER);
    window.localStorage.setItem(VIEWER_PRELOAD_BEFORE_KEY, String(before));
    window.localStorage.setItem(VIEWER_PRELOAD_AFTER_KEY, String(after));
  } catch {
    // 忽略配置同步失败，继续使用本地缓存或默认值。
  }
};

export const PhotoSwipeGallery: FC<PhotoSwipeGalleryProps> = ({
  items,
  isOpen,
  onClose,
  initialIndex = 0,
}) => {
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null);

  useEffect(() => {
    if (!isOpen || items.length === 0) {
      return;
    }

    let disposed = false;

    const initAndOpen = () => {
      const preloadConfig = getCachedPreloadConfig();
      void syncPreloadConfigInBackground();
      const dataSource = items.map((item) => ({
        id: item.id,
        src: item.originalUrl,
        msrc: item.thumbnailUrl,
        width: toSlideSize(item.width, DEFAULT_FALLBACK_WIDTH),
        height: toSlideSize(item.height, DEFAULT_FALLBACK_HEIGHT),
        alt: item.name,
      }));
      const dimensionCache = new Map<string, { width: number; height: number } | null>();
      const inFlightDimensionMap = new Map<string, Promise<{ width: number; height: number } | null>>();

      const getDimensionsByAssetId = (assetId: string, src: string) => {
        if (dimensionCache.has(assetId)) {
          return Promise.resolve(dimensionCache.get(assetId) ?? null);
        }
        const inFlight = inFlightDimensionMap.get(assetId);
        if (inFlight) {
          return inFlight;
        }
        const request = probeImageNaturalSize(src).then((result) => {
          dimensionCache.set(assetId, result);
          inFlightDimensionMap.delete(assetId);
          return result;
        });
        inFlightDimensionMap.set(assetId, request);
        return request;
      };

      const hydrateSlideSize = async (slideIndex: number, pswp?: any) => {
        if (slideIndex < 0 || slideIndex >= dataSource.length) {
          return;
        }
        const slide = dataSource[slideIndex] as (typeof dataSource)[number];
        const dimensions = await getDimensionsByAssetId(slide.id, slide.src);
        if (disposed || !dimensions) {
          return;
        }
        const hasChanged = slide.width !== dimensions.width || slide.height !== dimensions.height;
        if (!hasChanged) {
          return;
        }
        slide.width = dimensions.width;
        slide.height = dimensions.height;

        if (pswp && pswp.currIndex === slideIndex) {
          if (pswp.currSlide?.data) {
            pswp.currSlide.data.width = dimensions.width;
            pswp.currSlide.data.height = dimensions.height;
          }
          pswp.updateSize(true);
        }
      };

      const hydrateNearbySlides = (pswp: any, centerIndex: number) => {
        void hydrateSlideSize(centerIndex, pswp);
        void hydrateSlideSize(centerIndex - 1, pswp);
        void hydrateSlideSize(centerIndex + 1, pswp);
      };

      const lightbox = new PhotoSwipeLightbox({
        dataSource,
        pswpModule: PhotoSwipe as unknown as () => Promise<typeof PhotoSwipe>,
        preload: [preloadConfig.before, preloadConfig.after],
        wheelToZoom: true,
        secondaryZoomLevel: 2.5,
        maxZoomLevel: 6,
      } as any);

      lightbox.on('close', () => {
        onClose();
      });
      lightbox.on('change', () => {
        const pswp = (lightbox as any).pswp;
        if (!pswp) {
          return;
        }
        hydrateNearbySlides(pswp, pswp.currIndex);
      });

      lightbox.init();
      lightboxRef.current = lightbox;

      const index = Math.max(0, Math.min(items.length - 1, initialIndex));
      lightbox.loadAndOpen(index);
      window.setTimeout(() => {
        if (disposed) {
          return;
        }
        const pswp = (lightbox as any).pswp;
        if (!pswp) {
          return;
        }
        hydrateNearbySlides(pswp, index);
      }, 0);
    };

    initAndOpen();

    return () => {
      disposed = true;
      if (lightboxRef.current) {
        lightboxRef.current.destroy();
        lightboxRef.current = null;
      }
    };
  }, [initialIndex, isOpen, items, onClose]);

  return null;
};
