import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react-test-renderer';
import { api } from '../lib/api';
import { deferred, renderHook } from '../hooks/hook-test-renderer';
import type { AlbumListItemDTO } from '../types/api';
import {
  MAIN_ALBUM_ORDER,
  buildNextAlbumContext,
  resolveNextAlbumLocally,
  toNextAlbumParams,
  useNextAlbum,
  type NextAlbumContext,
} from './next-album';

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { protocol: 'http:', host: 'localhost', hostname: 'localhost' },
    setTimeout, clearTimeout,
  },
});

const album = (id: string): AlbumListItemDTO => ({
  id, name: id, sourceType: 'folder', assetCount: 1, coverUrl: null, isFavorite: false, updatedAt: '2026-01-01T00:00:00.000Z',
});

const baseInput = (overrides: Partial<Parameters<typeof buildNextAlbumContext>[0]> = {}): Parameters<typeof buildNextAlbumContext>[0] => ({
  galleryViewMode: 'albums',
  isRecentActive: false,
  selectedSmartAlbum: null,
  smartAlbumMemberAlbums: [],
  directoryNavigationAlbums: [],
  recentAlbums: [],
  albums: null,
  filters: { sortBy: 'updatedAt', sortOrder: 'desc', sourceType: '', libraryRootId: '' },
  debouncedKeyword: '',
  ...overrides,
});

test('resolveNextAlbumLocally：列表中间 → found；完整列表最后一个 → end', () => {
  const list = [album('a'), album('b'), album('c')];
  assert.deepEqual(resolveNextAlbumLocally(list, 'a', false), { status: 'found', albumId: 'b' });
  assert.deepEqual(resolveNextAlbumLocally(list, 'b', true), { status: 'found', albumId: 'c' });
  assert.deepEqual(resolveNextAlbumLocally(list, 'c', false), { status: 'end' });
});

test('resolveNextAlbumLocally：已加载页的最后一个但还有下一页 → unknown（旧逻辑在这里误判为没有下一个）', () => {
  assert.deepEqual(resolveNextAlbumLocally([album('a'), album('b')], 'b', true), { status: 'unknown' });
});

test('resolveNextAlbumLocally：当前图集不在列表里（刷新/直达/从首页进入）→ unknown，而不是“没有下一个”', () => {
  assert.deepEqual(resolveNextAlbumLocally([album('a')], 'zzz', false), { status: 'unknown' });
  assert.deepEqual(resolveNextAlbumLocally([], 'zzz', false), { status: 'unknown' });
  assert.deepEqual(resolveNextAlbumLocally(null, 'zzz', false), { status: 'unknown' });
});

test('buildNextAlbumContext：全部图集带上排序/筛选/关键词，并按游标判断还有没有下一页', () => {
  const context = buildNextAlbumContext(baseInput({
    albums: { items: [album('a')], pagination: { page: 1, pageSize: 1, total: 5, nextCursor: 'c2' } },
    filters: { sortBy: 'albumCount', sortOrder: 'asc', sourceType: 'zip', libraryRootId: 'root_1' },
    debouncedKeyword: ' 夏天 ',
  }));
  assert.equal(context.hasMore, true);
  assert.deepEqual(context.serverQuery, { sortBy: 'updatedAt', sortOrder: 'asc', keyword: '夏天', sourceType: 'zip', libraryRootId: 'root_1' });

  const last = buildNextAlbumContext(baseInput({
    albums: { items: [album('a')], pagination: { page: 1, pageSize: 24, total: 1, nextCursor: null } },
  }));
  assert.equal(last.hasMore, false);
});

test('buildNextAlbumContext：收藏视图只在收藏里找下一个', () => {
  const context = buildNextAlbumContext(baseInput({ galleryViewMode: 'favorites' }));
  assert.equal(context.serverQuery.favoriteOnly, true);
});

test('buildNextAlbumContext：首页不复用 albums 状态里残留的别的列表，交给服务端按主列表顺序', () => {
  const context = buildNextAlbumContext(baseInput({
    galleryViewMode: 'home',
    albums: { items: [album('stale_1'), album('stale_2')], pagination: { page: 1, pageSize: 24, total: 2, nextCursor: null } },
  }));
  assert.deepEqual(context.albums, []);
  assert.deepEqual(context.serverQuery, MAIN_ALBUM_ORDER);
});

test('buildNextAlbumContext：智能相册/目录/最近浏览用各自列表，列表完整（hasMore=false），上下文丢失时退回主列表顺序', () => {
  const members = [album('m1'), album('m2')];
  const smart = buildNextAlbumContext(baseInput({ galleryViewMode: 'smartAlbums', selectedSmartAlbum: 's1', smartAlbumMemberAlbums: members }));
  assert.equal(smart.albums, members);
  assert.equal(smart.hasMore, false);
  assert.deepEqual(smart.serverQuery, MAIN_ALBUM_ORDER);
  // 刷新后网址里没有智能相册 id：不能拿成员列表判断
  assert.deepEqual(buildNextAlbumContext(baseInput({ galleryViewMode: 'smartAlbums', smartAlbumMemberAlbums: members })).albums, []);

  const dirs = [album('d1')];
  assert.equal(buildNextAlbumContext(baseInput({ galleryViewMode: 'directoryAlbums', directoryNavigationAlbums: dirs })).albums, dirs);
  const recent = [album('r1')];
  const recentContext = buildNextAlbumContext(baseInput({ isRecentActive: true, recentAlbums: recent }));
  assert.equal(recentContext.albums, recent);
  assert.deepEqual(recentContext.serverQuery, MAIN_ALBUM_ORDER);
});

test('toNextAlbumParams 只带有值的筛选', () => {
  assert.deepEqual(toNextAlbumParams(MAIN_ALBUM_ORDER), { sortBy: 'updatedAt', sortOrder: 'desc' });
  assert.deepEqual(
    toNextAlbumParams({ sortBy: 'name', sortOrder: 'asc', keyword: 'k', sourceType: 'folder', libraryRootId: 'r', favoriteOnly: true }),
    { sortBy: 'name', sortOrder: 'asc', keyword: 'k', sourceType: 'folder', libraryRootId: 'r', favoriteOnly: 'true' },
  );
});

const contextOf = (albums: AlbumListItemDTO[], hasMore: boolean): NextAlbumContext => ({ albums, hasMore, serverQuery: { sortBy: 'name', sortOrder: 'asc' } });

test('useNextAlbum：本地能判断时不请求服务端', async (t) => {
  const calls: string[] = [];
  t.mock.method(api, 'get', (url: string) => { calls.push(url); return Promise.resolve({ album: null }); });
  let context = contextOf([album('a'), album('b')], false);
  let albumId = 'a';
  const hook = await renderHook(() => useNextAlbum({ albumId, context, enabled: true }));
  assert.deepEqual(hook.current, { nextAlbumId: 'b', status: 'ready' });
  albumId = 'b';
  await hook.rerender();
  assert.deepEqual(hook.current, { nextAlbumId: null, status: 'none' }, '完整列表的最后一个才隐藏按钮');
  context = contextOf([album('a'), album('b')], false);
  await hook.rerender();
  assert.equal(calls.length, 0);
  await hook.unmount();
});

test('useNextAlbum：已加载页末尾 → 先 loading，再用服务端结果（带排序参数）', async (t) => {
  const calls: Array<{ url: string; params?: Record<string, unknown> }> = [];
  const pending = deferred<{ album: AlbumListItemDTO | null }>();
  t.mock.method(api, 'get', (url: string, params?: Record<string, unknown>) => { calls.push({ url, params }); return pending.promise; });
  const context = contextOf([album('a'), album('b')], true);
  const hook = await renderHook(() => useNextAlbum({ albumId: 'b', context, enabled: true }));
  assert.deepEqual(hook.current, { nextAlbumId: null, status: 'loading' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/albums/b/next');
  assert.deepEqual(calls[0].params, { sortBy: 'name', sortOrder: 'asc' });
  await act(async () => { pending.resolve({ album: album('c') }); await pending.promise; });
  assert.deepEqual(hook.current, { nextAlbumId: 'c', status: 'ready' });
  await hook.unmount();
});

test('useNextAlbum：服务端确认没有下一个 → none；请求失败也按 none，不冒充有下一个', async (t) => {
  t.mock.method(api, 'get', () => Promise.resolve({ album: null }));
  const context = contextOf([], false);
  const hook = await renderHook(() => useNextAlbum({ albumId: 'x', context, enabled: true }));
  await act(async () => { await Promise.resolve(); });
  assert.deepEqual(hook.current, { nextAlbumId: null, status: 'none' });
  await hook.unmount();

  t.mock.restoreAll();
  t.mock.method(api, 'get', () => Promise.reject(new Error('boom')));
  const failing = await renderHook(() => useNextAlbum({ albumId: 'y', context, enabled: true }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  assert.deepEqual(failing.current, { nextAlbumId: null, status: 'none' });
  await failing.unmount();
});

test('useNextAlbum：切到别的图集时取消旧请求，旧结果不会串到新图集；未启用时不请求', async (t) => {
  const signals: AbortSignal[] = [];
  const pendings: Array<ReturnType<typeof deferred<{ album: AlbumListItemDTO | null }>>> = [];
  t.mock.method(api, 'get', (_url: string, _params: unknown, options?: { signal?: AbortSignal }) => {
    signals.push(options!.signal!);
    const pending = deferred<{ album: AlbumListItemDTO | null }>();
    pendings.push(pending);
    return pending.promise;
  });
  const context = contextOf([], false);
  let albumId = 'p';
  let enabled = false;
  const hook = await renderHook(() => useNextAlbum({ albumId, context, enabled }));
  assert.equal(signals.length, 0, '不在图集详情页时不请求');
  enabled = true;
  await hook.rerender();
  albumId = 'q';
  await hook.rerender();
  assert.equal(signals.length, 2);
  assert.equal(signals[0].aborted, true, '旧图集的请求被取消');
  await act(async () => { pendings[0].resolve({ album: album('from_p') }); await pendings[0].promise; });
  assert.deepEqual(hook.current, { nextAlbumId: null, status: 'loading' }, '旧结果不得生效');
  await act(async () => { pendings[1].resolve({ album: album('from_q') }); await pendings[1].promise; });
  assert.deepEqual(hook.current, { nextAlbumId: 'from_q', status: 'ready' });
  await hook.unmount();
});
