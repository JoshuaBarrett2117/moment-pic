import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react-test-renderer';
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
Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: class { static OPEN = 1; static CONNECTING = 0; readyState = 0; close() {} } });

test('实际图库控制器：失败 WebSocket 仍刷新健康相册且错误展示脱敏', async (context) => {
  class SocketDouble {
    static OPEN = 1;
    static CONNECTING = 0;
    static current: SocketDouble;
    readyState = 0;
    onmessage?: (event: { data: string }) => void;
    constructor() { SocketDouble.current = this; }
    close() {}
  }
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: SocketDouble });
  let albumsLoaded = 0;
  context.mock.method(api, 'get', (url: string) => {
    if (url.startsWith('/albums?')) { albumsLoaded += 1; return Promise.resolve({ items: [{ id: `healthy-${albumsLoaded}` }] }); }
    return Promise.resolve(url === '/auth/session' ? { authenticated: true } : []);
  });
  context.mock.method(api, 'getWithOptions', () => Promise.resolve([]));
  const hook = await renderHook(() => useGalleryDataController({
    currentScreen: Screen.GALLERY, debouncedKeyword: '', galleryViewMode: 'albums',
    isAuthenticated: true, isRecentActive: false, selectedSmartAlbum: null,
    filters: { page: 1, pageSize: 20, keyword: '', sortBy: 'updatedAt', sortOrder: 'desc', sourceType: '', libraryRootId: '', directoryLibraryRootId: '', directoryRelativePath: '' },
  }));
  try {
    const before = albumsLoaded;
    await act(async () => SocketDouble.current.onmessage?.({ data: JSON.stringify({ type: 'scan_complete', event: { libraryRootId: 'root', failureCount: 1, message: 'EIO /private/failure' } }) }));
    assert.ok(albumsLoaded > before);
    assert.equal(hook.current.albums?.items[0].id, `healthy-${albumsLoaded}`);
    assert.match(hook.current.scanError ?? '', /部分扫描失败/);
    assert.ok(!hook.current.scanError?.includes('/private/failure'));
  } finally { await hook.unmount(); }
});

test('实际图库控制器：查询切换与异步刷新交错，只允许当前查询生效', async (context) => {
  const requests: Array<{ url: string; signal?: AbortSignal } & ReturnType<typeof deferred>> = [];
  let delayedRoots = false;
  context.mock.method(api, 'get', (url: string, _params?: unknown, options?: { signal?: AbortSignal }) => {
    if (url === '/auth/session') return Promise.resolve({ authenticated: true });
    if (url === '/library-roots' && !delayedRoots) return Promise.resolve([]);
    const pending = { url, signal: options?.signal, ...deferred() };
    requests.push(pending);
    return pending.promise;
  });
  context.mock.method(api, 'getWithOptions', () => Promise.resolve([]));
  let input = {
    currentScreen: Screen.GALLERY, debouncedKeyword: 'old', galleryViewMode: 'albums' as const,
    isAuthenticated: true, isRecentActive: false, selectedSmartAlbum: null,
    filters: { page: 1, pageSize: 20, keyword: '', sortBy: 'updatedAt' as const, sortOrder: 'desc' as const, sourceType: '' as const, libraryRootId: '', directoryLibraryRootId: '', directoryRelativePath: '' },
  };
  const hook = await renderHook(() => useGalleryDataController(input));
  try {
    const first = requests.find((request) => request.url.includes('keyword=old'))!;
    input = { ...input, debouncedKeyword: 'new', filters: { ...input.filters, page: 2 } };
    await hook.rerender();
    const second = requests.find((request) => request.url.includes('keyword=new'))!;
    assert.ok(first.signal?.aborted);
    await act(async () => { second.resolve({ items: [{ id: 'new' }] }); });
    await act(async () => { first.resolve({ items: [{ id: 'old' }] }); });
    assert.equal(hook.current.albums?.items[0].id, 'new');
    delayedRoots = true;
    let refresh: Promise<void>;
    await act(async () => { refresh = hook.current.refreshCurrentGallery(); });
    const roots = requests.find((request) => request.url === '/library-roots')!;
    input = { ...input, debouncedKeyword: 'final' };
    await hook.rerender();
    const count = requests.length;
    await act(async () => { roots.resolve([]); await refresh; });
    assert.equal(requests.length, count, '旧 refresh 不得在 await 后发起旧查询');
    const last = requests.find((request) => request.url.includes('keyword=final'))!;
    await act(async () => { last.reject(new DOMException('取消', 'AbortError')); });
    assert.equal(hook.current.error, null);
  } finally { await hook.unmount(); }
});
