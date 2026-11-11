export type ThemeDefinition = {
  id: string;
  name: string;
  description: string;
  colorScheme: 'dark' | 'light';
  themeColor: string;
  preview: { background: string; surface: string; accent: string; text: string; overlay: string };
};

export const THEME_STORAGE_KEY = 'moment-pic:theme';

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'glass-dark',
    name: '暗夜玻璃',
    description: '压暗的照片墙配深色毛玻璃，让照片成为主角',
    colorScheme: 'dark',
    themeColor: '#070708',
    preview: { background: '#070708', surface: 'rgba(16,16,18,0.6)', accent: '#5e9be0', text: '#f7f7f8', overlay: 'rgba(6,6,7,0.55)' },
  },
  {
    id: 'rose-paper',
    name: '玫瑰纸感',
    description: '原来的粉色与奶油色，浅色、温暖，卡片带相框',
    colorScheme: 'light',
    themeColor: '#fff9eb',
    preview: { background: '#fff9eb', surface: 'rgba(255,249,235,0.8)', accent: '#77574f', text: '#1e1c10', overlay: 'rgba(255,249,235,0.82)' },
  },
];

export const DEFAULT_THEME_ID = 'glass-dark';

export const resolveThemeId = (value: string | null | undefined): string =>
  THEMES.some((theme) => theme.id === value) ? (value as string) : DEFAULT_THEME_ID;

export const getThemeDefinition = (id: string): ThemeDefinition =>
  THEMES.find((theme) => theme.id === id) ?? THEMES[0];
