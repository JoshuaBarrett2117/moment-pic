import { useLayoutEffect, useRef } from 'react';

export function useGalleryScrollRestoration(input: {
  scrollPosition?: number;
  onScrollPositionChange?: (position: number) => void;
}) {
  const mainRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (input.scrollPosition !== undefined && mainRef.current) {
      mainRef.current.scrollTop = input.scrollPosition;
    }
  }, [input.scrollPosition]);

  const rememberScrollPosition = () => {
    if (mainRef.current && input.onScrollPositionChange) {
      input.onScrollPositionChange(mainRef.current.scrollTop);
    }
  };

  return {
    mainRef,
    rememberScrollPosition,
  };
}
