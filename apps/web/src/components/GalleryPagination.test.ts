import assert from 'node:assert/strict';
import test from 'node:test';

import { getVisiblePages } from './GalleryPagination';

test('getVisiblePages returns all pages when total pages are five or fewer', () => {
  assert.deepEqual(getVisiblePages(1, 3), [1, 2, 3]);
});

test('getVisiblePages anchors near the beginning and end of long pagination', () => {
  assert.deepEqual(getVisiblePages(2, 10), [1, 2, 3, 4, 5]);
  assert.deepEqual(getVisiblePages(9, 10), [6, 7, 8, 9, 10]);
});

test('getVisiblePages centers the current page in the middle range', () => {
  assert.deepEqual(getVisiblePages(6, 10), [4, 5, 6, 7, 8]);
});
