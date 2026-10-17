import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react-test-renderer';
import { albumProgressApi } from '../lib/album-progress';
import type { AlbumAssetsDTO } from '../types/api';
import { renderHook, deferred } from './hook-test-renderer';
import { useAlbumReader } from './use-album-reader';

const page = (number: number): AlbumAssetsDTO => ({
  album: { id: 'album', name: 'album', assetCount: 240, isFavorite: false, updatedAt: '' },
  items: Array.from({ length: 24 }, (_, index) => { const position = (number - 1) * 24 + index; return { id: `asset-${position}`, name: String(position), extension: 'png', width: 10, height: 20, sortIndex: position + 1, thumbnailUrl: '/thumbnail', originalUrl: '/original' }; }),
  pagination: { page: number, pageSize: 24, total: 240 },
});

test('阅读控制器自动定位第 98 张，只取目标页；前后翻页窗口有界，关闭保存最后页', async (context) => {
  const pages: number[] = []; const writes: unknown[] = [];
  context.mock.method(albumProgressApi, 'get', async () => ({ assetId: 'asset-97', assetIndex: 97, total: 240, updatedAt: '', finished: false }));
  context.mock.method(albumProgressApi, 'page', async (_id: string, n: number) => { pages.push(n); return page(n); });
  context.mock.method(albumProgressApi, 'save', async (...args: unknown[]) => { writes.push(args); });
  const hook = await renderHook(() => useAlbumReader('album'));
  try {
    assert.deepEqual(pages, [5]); assert.equal(hook.current.session?.initialIndex, 1);
    assert.equal(hook.current.session?.items[1].id, 'asset-97');
    for (let i = 0; i < 4; i++) await act(async () => { await hook.current.loadNext(); });
    assert.ok(hook.current.session!.items.length <= 72);
    assert.equal(hook.current.session?.lastPage, 9);
    await act(async () => { await hook.current.loadPrevious(); });
    assert.ok(hook.current.session!.items.length <= 72);
    await act(async () => { hook.current.savePosition('asset-150', 150); hook.current.close(); });
    assert.deepEqual(writes, [['album', { assetId: 'asset-150', assetIndex: 150 }]]);
    assert.equal(hook.current.session, null);
  } finally { await hook.unmount(); }
});

test('分享模式不读取或写入进度；离开图集后旧进度响应不能打开查看器', async (context) => {
  const pending = deferred<null>();
  const get = context.mock.method(albumProgressApi, 'get', () => pending.promise);
  const save = context.mock.method(albumProgressApi, 'save', async () => null);
  const read = context.mock.method(albumProgressApi, 'page', async () => page(1));
  const shared = await renderHook(() => useAlbumReader('shared', false));
  await act(async () => { shared.current.savePosition('asset-0', 0); shared.current.close(); });
  assert.equal(get.mock.callCount(), 0); assert.equal(save.mock.callCount(), 0);
  await shared.unmount();
  const privateReader = await renderHook(() => useAlbumReader('private'));
  await privateReader.unmount();
  await act(async () => pending.resolve(null));
  assert.equal(read.mock.callCount(), 0);
});
