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
import { useLatestRequest } from './useLatestRequest';

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

test('useLatestRequest：卸载后 begin 返回已取消且非当前的请求', async () => {
  const hook = await renderHook(() => useLatestRequest());
  const begin = hook.current.begin;
  const active = begin();
  await hook.unmount();
  const late = begin();
  assert.equal(active.signal.aborted, true);
  assert.equal(late.signal.aborted, true);
  assert.equal(late.isCurrent(), false);
});

for (const entry of cases) {
  test(`${entry.name}：显式取消无替代请求也必须结束 loading`, async (context) => {
    const pending = deferred();
    context.mock.method(api, 'get', () => pending.promise);
    const hook = await renderHook(() => entry.hook() as unknown as Record<string, unknown>);
    try {
      let fetching!: Promise<unknown>;
      await act(async () => { fetching = (hook.current[entry.fetch] as (input?: unknown) => Promise<unknown>)(entry.fetch === 'fetchAssets' ? 'album' : {}); });
      assert.equal(hook.current.isLoading, true);
      await act(async () => { (hook.current.cancelRequests as () => void)(); });
      const loadingAfterCancel = hook.current.isLoading;
      await act(async () => { pending.resolve(entry.payload('late')); await fetching; });
      assert.equal(loadingAfterCancel, false);
      assert.equal(hook.current.isLoading, false);
      assert.equal(hook.current.error, null);
      assert.notDeepEqual(hook.current[entry.state], entry.payload('late'));
    } finally { await hook.unmount(); }
  });

  test(`${entry.name}：卸载后保留的 fetch 不得发起 API`, async (context) => {
    let called = 0;
    context.mock.method(api, 'get', () => { called += 1; return Promise.resolve(entry.payload('late')); });
    const hook = await renderHook(() => entry.hook() as unknown as Record<string, unknown>);
    const fetch = hook.current[entry.fetch] as (input?: unknown) => Promise<unknown>;
    await hook.unmount();
    await act(async () => { await fetch(entry.fetch === 'fetchAssets' ? 'album' : {}); });
    assert.equal(called, 0);
  });
}

for (const stage of ['detail', 'members', 'list'] as const) {
  test(`useSmartAlbums：列表与详情独立（${stage} 待定），loading 等待所有读取`, async (context) => {
    const calls: Array<ReturnType<typeof deferred> & { url: string; signal?: AbortSignal }> = [];
    context.mock.method(api, 'get', (url: string, _params?: unknown, options?: { signal?: AbortSignal }) => {
      const pending = { ...deferred(), url, signal: options?.signal };
      calls.push(pending);
      return pending.promise;
    });
    const hook = await renderHook(() => useSmartAlbums());
    try {
      let list!: Promise<unknown>;
      let detail!: Promise<unknown>;
      if (stage === 'list') await act(async () => { list = hook.current.fetchSmartAlbums(); });
      await act(async () => { detail = hook.current.fetchSmartAlbumDetail('selected'); });
      if (stage === 'members') await act(async () => { calls.find((call) => call.url === '/smart-albums/selected')!.resolve({ id: 'selected' }); });
      if (stage !== 'list') await act(async () => { list = hook.current.fetchSmartAlbums(); });
      assert.equal(calls.every((call) => !call.signal?.aborted), true);
      await act(async () => { calls.find((call) => call.url === '/smart-albums')!.resolve({ items: [{ id: 'list' }] }); await list; });
      assert.equal(hook.current.isLoading, true);
      if (stage !== 'members') await act(async () => { calls.find((call) => call.url === '/smart-albums/selected')!.resolve({ id: 'selected' }); });
      await act(async () => { calls.find((call) => call.url.endsWith('/selected/albums'))!.resolve({ items: [{ id: 'member' }] }); await detail; });
      assert.equal(hook.current.smartAlbumDetail?.id, 'selected');
      assert.equal(hook.current.smartAlbumMembers?.[0].id, 'member');
      assert.equal(hook.current.smartAlbums?.items[0].id, 'list');
      assert.equal(hook.current.isLoading, false);
    } finally { await hook.unmount(); }
  });
}

test('useSmartAlbums 详情的两阶段请求都遵守最新代次，旧 members/error 不覆盖且卸载取消', async (context) => {
  const calls: Array<ReturnType<typeof deferred> & { url: string; signal?: AbortSignal }> = [];
  context.mock.method(api, 'get', (url: string, _params?: unknown, options?: { signal?: AbortSignal }) => {
    const pending = { ...deferred(), url, signal: options?.signal };
    calls.push(pending);
    return pending.promise;
  });
  const hook = await renderHook(() => useSmartAlbums());
  try {
    let older!: Promise<unknown>;
    let newer!: Promise<unknown>;
    await act(async () => { older = hook.current.fetchSmartAlbumDetail('old'); });
    await act(async () => calls[0].resolve({ id: 'old' }));
    assert.equal(calls[1].url, '/smart-albums/old/albums');
    await act(async () => { newer = hook.current.fetchSmartAlbumDetail('new'); });
    assert.equal(calls[1].signal?.aborted, true);
    await act(async () => calls[2].resolve({ id: 'new' }));
    await act(async () => { calls[3].resolve({ items: [{ id: 'new-member' }] }); await newer; });
    await act(async () => { calls[1].reject(new Error('old members failure')); await older; });
    assert.equal(hook.current.smartAlbumDetail?.id, 'new');
    assert.equal(hook.current.smartAlbumMembers[0].id, 'new-member');
    assert.equal(hook.current.error, null);
    assert.equal(hook.current.isLoading, false);
    let pending!: Promise<unknown>;
    await act(async () => { pending = hook.current.fetchSmartAlbumDetail('unmount'); });
    await hook.unmount();
    assert.equal(calls[4].signal?.aborted, true);
    await act(async () => { calls[4].resolve({ id: 'unmount' }); await pending; });
    assert.equal(calls.length, 5, '卸载后不可发起 members 请求');
  } finally { await hook.unmount(); }
});

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
