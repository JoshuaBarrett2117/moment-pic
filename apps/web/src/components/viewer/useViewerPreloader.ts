import { useEffect, useRef } from 'react';
import type { ImageQualityPreset } from '../../lib/viewer-quality';
import { resolveImageSrc, resolvePreloadWindow, type ViewerImage } from '../viewer-gallery-utils';

type UseViewerPreloaderInput = {
  isOpen: boolean;
  images: ViewerImage[];
  activeIndex: number;
  qualityPreset: ImageQualityPreset;
  preloadBefore: number;
  preloadAfter: number;
};

export function useViewerPreloader({
  isOpen,
  images,
  activeIndex,
  qualityPreset,
  preloadBefore,
  preloadAfter,
}: UseViewerPreloaderInput) {
  const preloadedImagesRef = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    if (!isOpen || images.length === 0) {
      preloadedImagesRef.current = [];
      return;
    }

    const preloadWindow = resolvePreloadWindow({
      activeIndex,
      total: images.length,
      preset: qualityPreset,
      preloadBefore,
      preloadAfter,
    });
    if (!preloadWindow) {
      preloadedImagesRef.current = [];
      return;
    }

    const { start, end } = preloadWindow;
    const urlsToPreload = new Set<string>();

    for (let index = start; index <= end; index += 1) {
      if (index === activeIndex) {
        continue;
      }

      const target = images[index];
      if (target) {
        urlsToPreload.add(resolveImageSrc(target, qualityPreset));
      }
    }

    preloadedImagesRef.current = Array.from(urlsToPreload).map((src) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      return image;
    });

    return () => {
      preloadedImagesRef.current = [];
    };
  }, [activeIndex, images, isOpen, preloadAfter, preloadBefore, qualityPreset]);
}
