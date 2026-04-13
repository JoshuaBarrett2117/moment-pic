import { useMediaQuery } from 'react-responsive';

export const useMobile = () => useMediaQuery({ maxWidth: 639 });
export const useTablet = () => useMediaQuery({ minWidth: 640, maxWidth: 1023 });
export const useDesktop = () => useMediaQuery({ minWidth: 1024 });
export const useBetween = (min: number, max: number) =>
  useMediaQuery({ minWidth: min, maxWidth: max });
