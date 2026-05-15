import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PageTransitionModeDTO } from '../types/api';

type PageTransitionFrameProps = {
  screenKey: string;
  direction: number;
  mode: PageTransitionModeDTO;
  children: ReactNode;
};

const pageVariants = {
  enter: (slideDirection: number) => ({
    x: slideDirection > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (slideDirection: number) => ({
    x: slideDirection < 0 ? '100%' : '-100%',
    opacity: 0,
  }),
};

const normalVariants = {
  enter: {
    opacity: 0,
  },
  center: {
    opacity: 1,
  },
  exit: {
    opacity: 0,
  },
};

const pageTransition = {
  x: { type: 'spring', stiffness: 200, damping: 35, mass: 1 },
  opacity: { duration: 0.15 },
};

const normalTransition = {
  opacity: { duration: 0.18, ease: 'easeOut' },
};

export function PageTransitionFrame({
  screenKey,
  direction,
  mode,
  children,
}: PageTransitionFrameProps) {
  const variants = mode === 'page' ? pageVariants : normalVariants;
  const transition = mode === 'page' ? pageTransition : normalTransition;

  return (
    <AnimatePresence initial={false} custom={direction} mode="sync">
      <motion.div
        key={screenKey}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={transition}
        className="absolute inset-0 h-full w-full will-change-transform"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
