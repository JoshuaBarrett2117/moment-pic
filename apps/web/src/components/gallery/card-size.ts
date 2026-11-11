import { useCallback, useSyncExternalStore } from 'react';

/** 卡片尺寸：大 / 中 / 小，按系统设置的最小宽度缩放，偏好保存在当前浏览器。 */
export type CardSize = 'large' | 'medium' | 'small';
export const CARD_SIZE_KEY = 'moment-pic:card-size';
export const CARD_SIZE_SCALE: Record<CardSize, number> = { large: 1.3, medium: 1, small: 0.72 };
export const CARD_SIZE_LABEL: Record<CardSize, string> = { large: '大', medium: '中', small: '小' };

const listeners = new Set<() => void>();
const read = (): CardSize => {
  try {
    const value = window.localStorage.getItem(CARD_SIZE_KEY);
    return value === 'large' || value === 'small' ? value : 'medium';
  } catch {
    return 'medium';
  }
};
let current: CardSize | null = null;

export const scaleCardWidth = (base: number, size: CardSize, min = 120): number => Math.max(min, Math.round(base * CARD_SIZE_SCALE[size]));

export const useCardSize = () => {
  const size = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= read()),
    () => 'medium' as CardSize,
  );
  const setSize = useCallback((next: CardSize) => {
    current = next;
    try {
      window.localStorage.setItem(CARD_SIZE_KEY, next);
    } catch {
      // ignore
    }
    listeners.forEach((listener) => listener());
  }, []);
  return { size, setSize };
};
