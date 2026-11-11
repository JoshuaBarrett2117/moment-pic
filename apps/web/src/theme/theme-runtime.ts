import { getThemeDefinition, resolveThemeId, THEME_STORAGE_KEY } from './themes';

const readStoredTheme = (): string | null => {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const getActiveThemeId = (): string => resolveThemeId(readStoredTheme());

export const applyTheme = (id: string): string => {
  const resolved = resolveThemeId(id);
  const definition = getThemeDefinition(resolved);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = definition.colorScheme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = definition.themeColor;
  return resolved;
};

export const persistTheme = (id: string): string => {
  const resolved = applyTheme(id);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, resolved);
  } catch {
    // 隐私模式等场景写入失败时只在当前会话生效
  }
  return resolved;
};
