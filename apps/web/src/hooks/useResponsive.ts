import { useMediaQuery } from 'react-responsive';

export const useMobile = () => useMediaQuery({ query: '(max-width: 639px), (hover: none) and (pointer: coarse)' });
export const useWideMobile = () => useMediaQuery({ query: '(hover: none) and (pointer: coarse) and (min-width: 720px)' });
export const useTablet = () => useMediaQuery({ minWidth: 640, maxWidth: 1023 });
export const useDesktop = () => useMediaQuery({ minWidth: 1024 });
export const useBetween = (min: number, max: number) =>
  useMediaQuery({ minWidth: min, maxWidth: max });
