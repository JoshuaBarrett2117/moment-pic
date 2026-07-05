import test from 'node:test';
import assert from 'node:assert/strict';

import { clampGridWidth, formatLibraryRootScanTime } from './settings-screen-utils';

test('clampGridWidth clamps invalid and out-of-range values', () => {
  assert.equal(clampGridWidth(Number.NaN), 160);
  assert.equal(clampGridWidth(100), 180);
  assert.equal(clampGridWidth(610), 600);
  assert.equal(clampGridWidth(249.6), 250);
});

test('formatLibraryRootScanTime handles empty and concrete scan timestamps', () => {
  assert.equal(formatLibraryRootScanTime(null), '从未扫描');
  assert.match(formatLibraryRootScanTime('2026-05-15T08:00:00.000Z'), /2026/);
});
