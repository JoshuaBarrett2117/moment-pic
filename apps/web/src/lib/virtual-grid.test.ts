import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRowOffsets, computeColumns, computeItemWidth, computeVisibleRows } from './virtual-grid';

test('列数与 CSS auto-fill minmax(min(100%, X), 1fr) 一致', () => {
  assert.equal(computeColumns(1000, 200, 16), 4); // (1000+16)/(216)=4.7
  assert.equal(computeColumns(1080, 200, 16), 5);
  assert.equal(computeColumns(150, 200, 16), 1); // 比最小宽度还窄时 min(100%) 生效
  assert.equal(computeColumns(0, 200, 16), 1);
  assert.equal(computeItemWidth(1000, 4, 16), 238);
});

test('行偏移：估算与实测混用，最后一项是总高度', () => {
  const offsets = buildRowOffsets(3, 100, 10, new Map([[1, 150]]));
  assert.deepEqual(offsets, [0, 110, 270, 370]);
  assert.deepEqual(buildRowOffsets(0, 100, 10), [0]);
});

test('可见行：4192 个相册、6 列时只渲染视口附近几行', () => {
  const rowCount = Math.ceil(4192 / 6);
  const offsets = buildRowOffsets(rowCount, 250, 16);
  const range = computeVisibleRows({ offsets, rowCount, viewportTop: 266 * 300, viewportHeight: 900, overscanPx: 900 });
  assert.equal(range.start, Math.floor((266 * 300 - 900) / 266));
  assert.ok(range.end - range.start + 1 <= 12, JSON.stringify(range));
  // 网格在视口下方 / 滚到底 / 空列表
  assert.deepEqual(computeVisibleRows({ offsets, rowCount, viewportTop: -5000, viewportHeight: 900, overscanPx: 900 }), { start: 0, end: 0 });
  const bottom = computeVisibleRows({ offsets, rowCount, viewportTop: offsets[rowCount] - 900, viewportHeight: 900, overscanPx: 900 });
  assert.equal(bottom.end, rowCount - 1);
  assert.deepEqual(computeVisibleRows({ offsets: [0], rowCount: 0, viewportTop: 0, viewportHeight: 900, overscanPx: 900 }), { start: 0, end: -1 });
});
