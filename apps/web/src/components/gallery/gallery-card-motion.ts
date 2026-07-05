export const galleryGridContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

export const galleryCardItemVariants = {
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
    : { scale: 1.015, rotate: input.index % 2 === 0 ? 0.35 : -0.35, zIndex: 10 };

export const getGalleryCardTagPlacement = (index: number) =>
  index % 2 === 0 ? '-right-2 rotate-12' : '-left-3 -rotate-12';
