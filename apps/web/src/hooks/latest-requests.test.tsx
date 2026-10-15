import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react-test-renderer';
import { api } from '../lib/api';
import { renderHook, deferred } from './hook-test-renderer';
import { useAlbums, useAlbumAssets, useRecentAlbums } from './useAlbums';
import { useDirectoryAlbums } from './useDirectoryAlbums';
import { useLibraryRoots } from './useLibraryRoots';
import { useSystemConfig } from './useSystemConfig';
import { useSmartAlbums } from './useSmartAlbums';

Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } } });

const cases = [
  { name: 'useAlbums', hook: useAlbums, fetch: 'fetchAlbums', state: 'albums', payload: (id: string) => ({ items: [{ id }] }) },
  { name: 'useAlbumAssets', hook: useAlbumAssets, fetch: 'fetchAssets', state: 'assets', payload: (id: string) => ({ items: [{ id }] }) },
  { name: 'useRecentAlbums', hook: useRecentAlbums, fetch: 'fetchRecentAlbums', state: 'recentAlbums', payload: (id: string) => ({ items: [{ id }] }) },
  { name: 'useDirectoryAlbums', hook: useDirectoryAlbums, fetch: 'fetchDirectoryAlbums', state: 'directoryAlbums', payload: (id: string) => ({ items: [{ id }] }) },
  { name: 'useLibraryRoots', hook: useLibraryRoots, fetch: 'fetchLibraryRoots', state: 'libraryRoots', payload: (id: string) => [{ id }] },
  { name: 'useSystemConfig', hook: useSystemConfig, fetch: 'fetchSystemConfig', state: 'systemConfig', payload: (id: string) => ({ id }) },
  { name: 'useSmartAlbums', hook: useSmartAlbums, fetch: 'fetchSmartAlbums', state: 'smartAlbums', payload: (id: string) => ({ items: [{ id }] }) },
];

for (const entry of cases) {
  test(`${entry.name} 实际 Hook：旧响应/错误/finally 不覆盖新状态，取消无错误且卸载终止`, async (context) => {
    const calls: Array<ReturnType<typeof deferred> & { signal?: AbortSignal }> = [];
    context.mock.method(api, 'get', (_url: string, _params?: unknown, options?: { signal?: AbortSignal }) => {
      const pending = { ...deferred(), signal: options?.signal };
      calls.push(pending);
      return pending.promise;
    });
    const hook = await renderHook(() => entry.hook() as unknown as Record<string, unknown>);
    const fetch = () => (hook.current[entry.fetch] as (input?: unknown) => Promise<unknown>)(entry.fetch === 'fetchAssets' ? 'album-id' : {});
    try {
      let first: Promise<unknown>;
      let second: Promise<unknown>;
      await act(async () => { first = fetch(); second = fetch(); });
      assert.equal(calls[0].signal?.aborted, true);
      await act(async () => { calls[0].resolve(entry.payload('old')); await first; });
      assert.equal(hook.current.isLoading, true);
      await act(async () => { calls[1].resolve(entry.payload('new')); await second; });
      const newest = hook.current[entry.state];
      assert.equal(hook.current.isLoading, false);
      let older: Promise<unknown>;
      let newer: Promise<unknown>;
      await act(async () => { older = fetch(); newer = fetch(); });
      await act(async () => { calls[3].resolve(entry.payload('newest')); await newer; });
      const expected = hook.current[entry.state];
      await act(async () => { calls[2].resolve(entry.payload('stale-last')); await older; });
      assert.deepEqual(hook.current[entry.state], expected);
      assert.notDeepEqual(expected, newest);
      await act(async () => { older = fetch(); newer = fetch(); });
      await act(async () => { calls[5].resolve(entry.payload('final')); await newer; });
      await act(async () => { calls[4].reject(new Error('stale error')); await older; });
      assert.equal(hook.current.error, null);
      assert.equal(hook.current.isLoading, false);
      let cancel: Promise<unknown>;
      await act(async () => { cancel = fetch(); });
      await act(async () => { calls[6].reject(new DOMException('取消', 'AbortError')); await cancel; });
      assert.equal(hook.current.error, null);
      assert.equal(hook.current.isLoading, false);
      let pending: Promise<unknown>;
      await act(async () => { pending = fetch(); });
      await hook.unmount();
      assert.equal(calls[7].signal?.aborted, true);
      const count = hook.renders;
      await act(async () => { calls[7].resolve(entry.payload('after-unmount')); await pending; });
      assert.equal(hook.renders, count);
    } finally { await hook.unmount(); }
  });
}
