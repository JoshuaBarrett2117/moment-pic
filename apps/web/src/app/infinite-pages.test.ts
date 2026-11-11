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
