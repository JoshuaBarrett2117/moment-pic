import assert from 'node:assert/strict';
import test from 'node:test';
import { accumulatePages, hasMorePages } from './infinite-pages';

const page = (n: number, ids: string[], total = 10, extra = '') => ({
  items: ids.map((id) => ({ id, label: `${id}${extra}` })),
  pagination: { page: n, pageSize: 3, total },
});

test('无限滚动：下一页按 id 去重追加，同页刷新原位更新', () => {
  let state = accumulatePages(null, 'q', page(1, ['a', 'b', 'c']));
  state = accumulatePages(state, 'q', page(2, ['c', 'd', 'e']));
  assert.deepEqual(state.items.map((item) => item.id), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(state.loadedPage, 2);

  state = accumulatePages(state, 'q', page(2, ['d', 'e', 'f'], 10, '!'));
  assert.deepEqual(state.items.map((item) => item.id), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(state.items[3].label, 'd!');

  state = accumulatePages(state, 'q', page(1, ['a', 'b', 'c'], 10, '*'));
  assert.equal(state.items.length, 5, '刷新第一页不丢已加载内容');
  assert.equal(state.items[0].label, 'a*');
});

test('无限滚动：查询变化或跳页时重新开始', () => {
  let state = accumulatePages(null, 'q', page(1, ['a', 'b', 'c']));
  state = accumulatePages(state, 'q2', page(1, ['x']));
  assert.deepEqual(state.items.map((item) => item.id), ['x']);
  state = accumulatePages(state, 'q2', page(4, ['y']));
  assert.deepEqual(state.items.map((item) => item.id), ['y']);
});

test('是否还有更多', () => {
  assert.equal(hasMorePages({ page: 1, pageSize: 3, total: 10 }), true);
  assert.equal(hasMorePages({ page: 4, pageSize: 3, total: 10 }), false);
  assert.equal(hasMorePages(null), false);
});

const cursorPage = (n: number, ids: string[], nextCursor: string | null, total = 7) => ({
  items: ids.map((id) => ({ id, label: id })),
  pagination: { page: n, pageSize: 3, total, nextCursor },
});

test('游标分页：hasMore 以 nextCursor 为准，并记录每页所需游标', () => {
  let state = accumulatePages(null, 'q', cursorPage(1, ['a', 'b', 'c'], 'c1'));
  assert.equal(hasMorePages(state.pagination), true);
  assert.deepEqual(state.pageCursors, { 2: 'c1' });
  state = accumulatePages(state, 'q', cursorPage(2, ['d', 'e', 'f'], 'c2'));
  assert.deepEqual(state.pageCursors, { 2: 'c1', 3: 'c2' });
  assert.equal(state.pagination.nextCursor, 'c2');

  // 刷新第 1 页（扫描轮询/回到列表）：nextCursor 仍是最后已加载页的
  state = accumulatePages(state, 'q', cursorPage(1, ['a', 'b', 'c'], 'c1-new', 8));
  assert.equal(state.pagination.nextCursor, 'c2');
  assert.equal(state.pagination.total, 8);
  assert.equal(state.items.length, 6);

  state = accumulatePages(state, 'q', cursorPage(3, ['g'], null));
  assert.deepEqual(state.items.map((item) => item.id), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.equal(hasMorePages(state.pagination), false, '最后一页 nextCursor 为 null');
  // 即便总数大于已加载数，nextCursor 为 null 也视为没有更多（游标优先于总数推算）
  assert.equal(hasMorePages({ page: 1, pageSize: 3, total: 100, nextCursor: null }), false);
  assert.equal(hasMorePages({ page: 9, pageSize: 3, total: 3, nextCursor: 'x' }), true);
});
