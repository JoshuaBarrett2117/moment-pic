import type { Variants } from 'motion/react';

export const galleryGridContainerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

export const galleryCardItemVariants: Variants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 20 },
  },
};

export const getGalleryCardHover = (input: { index: number; isMobile: boolean }) =>
  input.isMobile
    ? undefined
    : { y: -3, zIndex: 10 };

export const getGalleryCardTagPlacement = () => 'right-3';
