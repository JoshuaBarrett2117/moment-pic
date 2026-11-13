import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, type Transition, type Variants } from 'motion/react';
import type { PageTransitionModeDTO } from '../types/api';

type PageTransitionFrameProps = {
  screenKey: string;
  direction: number;
  mode: PageTransitionModeDTO;
  children: ReactNode;
};

const pageVariants: Variants = {
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

// 必须与 pageVariants 拥有同样的键（x）：动画进行中从 page 切到 normal 时，
// 缺少 x 会让 motion 把横向弹簧停在中间值，整页（含 fixed 侧栏）卡在半路。
const normalVariants: Variants = {
  enter: {
    x: 0,
    opacity: 0,
  },
  center: {
    x: 0,
    opacity: 1,
  },
  exit: {
    x: 0,
    opacity: 0,
  },
};

const pageTransition: Transition = {
  x: { type: 'spring', stiffness: 200, damping: 35, mass: 1 },
  opacity: { duration: 0.15 },
};

const normalTransition: Transition = {
  x: { duration: 0 },
  opacity: { duration: 0.18, ease: 'easeOut' },
};

export function PageTransitionFrame({
  screenKey,
  direction,
  mode,
  children,
}: PageTransitionFrameProps) {
  // 每次切换开始时锁定动画模式：系统设置在动画中途才加载完成时，不影响正在进行的这次切换。
  const [locked, setLocked] = useState({ screenKey, mode });
  if (locked.screenKey !== screenKey) setLocked({ screenKey, mode });
  const activeMode = locked.screenKey === screenKey ? locked.mode : mode;
  const variants = activeMode === 'page' ? pageVariants : normalVariants;
  const transition = activeMode === 'page' ? pageTransition : normalTransition;

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
        className="absolute inset-0 h-full w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
