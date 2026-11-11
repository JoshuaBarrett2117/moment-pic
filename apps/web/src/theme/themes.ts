export type ThemeDefinition = {
  id: string;
  name: string;
  description: string;
  colorScheme: 'dark' | 'light';
  themeColor: string;
  preview: { background: string; surface: string; accent: string };
};

export const THEME_STORAGE_KEY = 'moment-pic:theme';

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'glass-dark',
    name: '黑色磨砂玻璃',
    description: '深色背景、半透明毛玻璃面板，突出照片本身',
    colorScheme: 'dark',
    themeColor: '#0b0d12',
    preview: { background: '#0b0d12', surface: 'rgba(255,255,255,0.08)', accent: '#8ab4ff' },
  },
];

export const DEFAULT_THEME_ID = 'glass-dark';

export const resolveThemeId = (value: string | null | undefined): string =>
  THEMES.some((theme) => theme.id === value) ? (value as string) : DEFAULT_THEME_ID;

export const getThemeDefinition = (id: string): ThemeDefinition =>
  THEMES.find((theme) => theme.id === id) ?? THEMES[0];
