import { useSyncExternalStore } from 'react';

const subscribe = (query: string) => (onChange: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    subscribe(query),
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );

export const useMobile = () => useMediaQuery('(max-width: 639px), (hover: none) and (pointer: coarse)');
export const useWideMobile = () => useMediaQuery('(hover: none) and (pointer: coarse) and (min-width: 720px)');
export const useTablet = () => useMediaQuery('(min-width: 640px) and (max-width: 1023px)');
export const useDesktop = () => useMediaQuery('(min-width: 1024px)');
export const useBetween = (min: number, max: number) => useMediaQuery(`(min-width: ${min}px) and (max-width: ${max}px)`);
