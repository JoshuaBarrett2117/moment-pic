import { useLayoutEffect, useRef } from 'react';

export function useGalleryScrollRestoration(input: {
  scrollPosition?: number;
  onScrollPositionChange?: (position: number) => void;
}) {
  const mainRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const target = input.scrollPosition;
    const node = mainRef.current;
    if (target === undefined || !node) return;
    node.scrollTop = target;
    // 虚拟化网格要等测得宽度后才撑开总高度，首次设置可能被截断；之后几帧内补设
    if (typeof requestAnimationFrame === 'undefined' || node.scrollTop >= target - 1) return;
    let frame = 0;
    let attempts = 0;
    const retry = () => {
      attempts += 1;
      node.scrollTop = target;
      if (node.scrollTop < target - 1 && attempts < 20) frame = requestAnimationFrame(retry);
    };
    frame = requestAnimationFrame(retry);
    const cancel = () => cancelAnimationFrame(frame);
    // 用户自己开始滚动就停止补设
    node.addEventListener('wheel', cancel, { once: true, passive: true });
    node.addEventListener('touchstart', cancel, { once: true, passive: true });
    return () => {
      cancel();
      node.removeEventListener('wheel', cancel);
      node.removeEventListener('touchstart', cancel);
    };
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
