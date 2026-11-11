import { useCallback, useSyncExternalStore } from 'react';
import { THEMES } from './themes';
import { getActiveThemeId, persistTheme } from './theme-runtime';

const listeners = new Set<() => void>();
let currentTheme: string | null = null;

const getSnapshot = (): string => {
  if (currentTheme === null) currentTheme = getActiveThemeId();
  return currentTheme;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setActiveTheme = (id: string): void => {
  currentTheme = persistTheme(id);
  listeners.forEach((listener) => listener());
};

export const useTheme = () => {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setTheme = useCallback((id: string) => setActiveTheme(id), []);
  return { theme, themes: THEMES, setTheme };
};
