import { useCallback, useSyncExternalStore } from 'react';

/**
 * 背景图：默认照片墙 / 我的图片（按账号存在服务器）/ 不用图片。
 * 选哪一种只保存在当前浏览器；自定义图片本身跟着账号走，换设备也在。
 */
export type BackgroundMode = 'default' | 'custom' | 'none';

export const BACKGROUND_MODE_KEY = 'moment-pic:bg-mode';
export const BACKGROUND_URL_KEY = 'moment-pic:bg-url';
const CUSTOM_URL_PATTERN = /^\/api\/v1\/account\/background\?v=[0-9a-f]{12}$/;

export const isValidCustomBackgroundUrl = (value: unknown): value is string =>
  typeof value === 'string' && CUSTOM_URL_PATTERN.test(value);

export const resolveBackgroundMode = (value: unknown): BackgroundMode =>
  value === 'custom' || value === 'none' ? value : 'default';

type BackgroundState = { mode: BackgroundMode; customUrl: string | null; active: boolean };

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null) => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // 隐私模式写入失败时只在当前会话生效
  }
};

let state: BackgroundState | null = null;
const listeners = new Set<() => void>();

const initialState = (): BackgroundState => {
  const url = read(BACKGROUND_URL_KEY);
  return { mode: resolveBackgroundMode(read(BACKGROUND_MODE_KEY)), customUrl: isValidCustomBackgroundUrl(url) ? url : null, active: false };
};

/** 实际生效的背景：只有登录后才会加载自定义图片（未登录请求会 401）。 */
export const resolveEffectiveBackground = (input: BackgroundState): { kind: 'default' | 'none' | 'custom'; url?: string } => {
  if (input.mode === 'none') return { kind: 'none' };
  if (input.mode === 'custom' && input.active && input.customUrl) return { kind: 'custom', url: input.customUrl };
  return { kind: 'default' };
};

const apply = (next: BackgroundState) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const effective = resolveEffectiveBackground(next);
  root.dataset.bg = effective.kind;
  if (effective.kind === 'custom' && effective.url) root.style.setProperty('--mp-bg-image', `url("${effective.url}")`);
  else root.style.removeProperty('--mp-bg-image');
};

const getSnapshot = (): BackgroundState => {
  if (state === null) state = initialState();
  return state;
};

const update = (patch: Partial<BackgroundState>) => {
  state = { ...getSnapshot(), ...patch };
  apply(state);
  listeners.forEach((listener) => listener());
};

export const setBackgroundMode = (mode: BackgroundMode) => {
  write(BACKGROUND_MODE_KEY, mode);
  update({ mode });
};

export const setCustomBackgroundUrl = (url: string | null) => {
  const valid = isValidCustomBackgroundUrl(url) ? url : null;
  write(BACKGROUND_URL_KEY, valid);
  update({ customUrl: valid });
};

/** 登录状态变化时调用：登出后立即退回默认背景，避免登录页请求自定义图片。 */
export const setBackgroundSessionActive = (active: boolean) => {
  if (getSnapshot().active === active) return;
  update({ active });
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useBackground = () => {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setMode = useCallback((mode: BackgroundMode) => setBackgroundMode(mode), []);
  return { ...snapshot, setMode, setCustomUrl: setCustomBackgroundUrl };
};
