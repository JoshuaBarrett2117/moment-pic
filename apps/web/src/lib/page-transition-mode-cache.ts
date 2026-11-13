import type { PageTransitionModeDTO } from '../types/api';

const STORAGE_KEY = 'mp.pageTransitionMode';
const MODES: readonly PageTransitionModeDTO[] = ['page', 'normal'];

/** 系统设置要登录后才能拉取；缓存上次的页面切换模式，让登录后的第一次切换就用对的动画。 */
export const readCachedPageTransitionMode = (): PageTransitionModeDTO | null => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return MODES.includes(value as PageTransitionModeDTO) ? (value as PageTransitionModeDTO) : null;
  } catch {
    return null;
  }
};

export const writeCachedPageTransitionMode = (mode: PageTransitionModeDTO): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // 隐私模式或存储已满时忽略。
  }
};
