import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../lib/api';
import { deferred, renderHook } from '../hooks/hook-test-renderer';
import { useGalleryDataController } from './use-gallery-data-controller';
import { Screen } from '../types';

const windowStub = {
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { protocol: 'http:', host: 'localhost', hostname: 'localhost' },
  setInterval, clearInterval, setTimeout, clearTimeout,
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: windowStub });
Object.defineProperty(globalThis, 'WebSocket', {
  configurable: true,
  value: class { static OPEN = 1; static CONNECTING = 0; readyState = 0; close() {} },
});

const galleryInput = (overrides: Partial<Parameters<typeof useGalleryDataController>[0]> = {}): Parameters<typeof useGalleryDataController>[0] => ({
  currentScreen: Screen.GALLERY,
  debouncedKeyword: '',
  galleryViewMode: 'albums',
  isAuthenticated: true,
  isRecentActive: false,
  selectedSmartAlbum: null,
  filters: {
    page: 1, pageSize: 24, keyword: '', sortBy: 'updatedAt', sortOrder: 'desc',
    sourceType: '', libraryRootId: '', directoryLibraryRootId: '', directoryRelativePath: '',
  },
  ...overrides,
});

test('实际图库控制器：最近浏览时关键词防抖变化不得取消在途的 recent 读取，也不得清空已有结果', async (context) => {
  const calls: Array<ReturnType<typeof deferred> & { url: string; signal?: AbortSignal }> = [];
  context.mock.method(api, 'get', (url: string, _params?: unknown, options?: { signal?: AbortSignal }) => {
    if (url === '/auth/session') return Promise.resolve({ authenticated: true });
    const pending = { ...deferred(), url, signal: options?.signal };
    calls.push(pending);
    return pending.promise;
  });
  context.mock.method(api, 'getWithOptions', () => Promise.resolve([]));

  let input = galleryInput({ isRecentActive: true, debouncedKeyword: '残留关键词' });
  const hook = await renderHook(() => useGalleryDataController(input));
  try {
    const recent = calls.find((call) => call.url.startsWith('/albums/recent'));
    assert.ok(recent, '进入最近浏览必须发起 /albums/recent 读取');
    assert.equal(recent.signal?.aborted, false, 'recent 读取发起时不应已被取消');

    const before = calls.length;
    // 关键词防抖落地：这一变化与最近浏览无关，不得让它失效
    input = { ...input, debouncedKeyword: '残留关键词X' };
    await hook.rerender();

    assert.equal(recent.signal?.aborted, false, '关键词防抖变化不得取消在途的 recent 读取');
    assert.equal(
      calls.filter((call) => call.url.startsWith('/albums/recent')).length,
      1,
      '最近浏览不应因关键词变化而重新发起读取',
    );
    assert.equal(calls.length, before, '关键词变化不得在最近浏览下触发其它相册读取');

    // 迟到的响应仍须被采纳（结果不被丢弃）
    recent.resolve({ items: [{ id: 'alb_1' }] });
    await hook.unmount();
  } finally {
    await hook.unmount();
  }
});

test('实际图库控制器：普通相册列表下关键词变化仍会取消旧读取并重新查询（防回归）', async (context) => {
  const calls: Array<ReturnType<typeof deferred> & { url: string; signal?: AbortSignal }> = [];
  context.mock.method(api, 'get', (url: string, _params?: unknown, options?: { signal?: AbortSignal }) => {
    if (url === '/auth/session') return Promise.resolve({ authenticated: true });
    if (url === '/library-roots') return Promise.resolve([]);
    const pending = { ...deferred(), url, signal: options?.signal };
    calls.push(pending);
    return pending.promise;
  });
  context.mock.method(api, 'getWithOptions', () => Promise.resolve([]));

  let input = galleryInput({ isRecentActive: false, debouncedKeyword: 'A' });
  const hook = await renderHook(() => useGalleryDataController(input));
  try {
    const first = calls.find((call) => call.url.startsWith('/albums'));
    assert.ok(first, '普通列表首次应发起 /albums 读取');

    input = { ...input, debouncedKeyword: 'AB' };
    await hook.rerender();

    assert.equal(first.signal?.aborted, true, '普通列表关键词变化必须取消旧读取');
    assert.equal(
      calls.filter((call) => call.url.startsWith('/albums')).length,
      2,
      '普通列表关键词变化必须重新查询',
    );
    await hook.unmount();
  } finally {
    await hook.unmount();
  }
});
