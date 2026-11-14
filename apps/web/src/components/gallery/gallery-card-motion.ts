import { useEffect, useState } from 'react';
import type { Variants } from 'motion/react';

/** 只有前 12 张卡片做级联入场，之后的卡片直接以最终状态出现（24 张不再要 1.2 s 才全部出现）。 */
export const GALLERY_CASCADE_LIMIT = 12;
export const GALLERY_CASCADE_STEP_SECONDS = 0.05;

const SHOWN = { opacity: 1, y: 0, scale: 1 };

export const getGalleryCardEntranceDelay = (index: number): number =>
  index >= 0 && index < GALLERY_CASCADE_LIMIT ? index * GALLERY_CASCADE_STEP_SECONDS : 0;

/** 容器只做整体淡入；级联延迟由卡片按自身序号（custom）计算，不再用 staggerChildren 无上限地累加。 */
export const galleryGridContainerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

const cardIndex = (custom: unknown): number => (typeof custom === 'number' && Number.isFinite(custom) ? custom : 0);

export const galleryCardItemVariants: Variants = {
  hidden: (custom: unknown) => (cardIndex(custom) >= GALLERY_CASCADE_LIMIT ? SHOWN : { opacity: 0, y: 30, scale: 0.95 }),
  show: (custom: unknown) => {
    const index = cardIndex(custom);
    return {
      ...SHOWN,
      transition: index >= GALLERY_CASCADE_LIMIT
        ? { duration: 0 }
        : { type: 'spring', stiffness: 260, damping: 20, delay: getGalleryCardEntranceDelay(index) },
    };
  },
};

const playedEntrances = new Set<string>();

/** 本次会话内同一区域的入场动画只播一次：返回列表（重新挂载）时直接显示最终状态，不再重放。 */
export const useGalleryEntrance = (key: string): 'hidden' | false => {
  const [initial] = useState<'hidden' | false>(() => (playedEntrances.has(key) ? false : 'hidden'));
  useEffect(() => {
    playedEntrances.add(key);
  }, [key]);
  return initial;
};

/** 测试用：清空已播放记录。 */
export const resetGalleryEntrancesForTest = () => playedEntrances.clear();

export const getGalleryCardHover = (input: { index: number; isMobile: boolean }) =>
  input.isMobile
    ? undefined
    : { y: -3, zIndex: 10 };

export const getGalleryCardTagPlacement = () => 'right-3';
