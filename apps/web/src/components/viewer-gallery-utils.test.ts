import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPreviewSrc,
  getPreloadHint,
  getQualityLabel,
  getTouchPointsDistance,
  QUALITY_OPTIONS,
  resolveImageSrc,
  resolvePreloadWindow,
  resolveViewerNextAction,
  resolveViewerIndexAfterImagesChange,
  resolveViewerInitialIndex,
} from './viewer-gallery-utils';

test('viewer gallery resolves original and preview image sources', () => {
  const image = { id: 'asset_1', originalSrc: '/api/v1/assets/asset_1/original' };

  assert.equal(resolveImageSrc(image, 'original'), '/api/v1/assets/asset_1/original');
  assert.equal(resolveImageSrc(image, 'balanced'), '/api/v1/assets/asset_1/preview?preset=balanced');
  assert.equal(buildPreviewSrc('asset_1', 'high'), '/api/v1/assets/asset_1/preview?preset=high');
});

test('viewer gallery exposes quality labels and preload hints', () => {
  assert.deepEqual(QUALITY_OPTIONS.map((option) => option.value), ['low', 'balanced', 'high', 'original']);
  assert.equal(getQualityLabel('low'), '省流');
  assert.equal(getQualityLabel('balanced'), '均衡');
  assert.equal(getQualityLabel('high'), '高清');
  assert.equal(getQualityLabel('original'), '原图');
  assert.equal(getPreloadHint('low'), null);
  assert.equal(getPreloadHint('high'), '当前档位会减少相邻预加载');
  assert.equal(getPreloadHint('original'), '当前档位已关闭相邻预加载');
});

test('resolvePreloadWindow clamps original and high quality preload ranges', () => {
  assert.deepEqual(resolvePreloadWindow({ activeIndex: 5, total: 10, preset: 'original', preloadBefore: 8, preloadAfter: 8 }), { start: 5, end: 5 });
  assert.deepEqual(resolvePreloadWindow({ activeIndex: 5, total: 10, preset: 'high', preloadBefore: 8, preloadAfter: 8 }), { start: 4, end: 6 });
  assert.deepEqual(resolvePreloadWindow({ activeIndex: 1, total: 3, preset: 'balanced', preloadBefore: 8, preloadAfter: 8 }), { start: 0, end: 2 });
  assert.equal(resolvePreloadWindow({ activeIndex: 0, total: 0, preset: 'balanced', preloadBefore: 1, preloadAfter: 1 }), null);
});

test('viewer index keeps current page position when appended images arrive', () => {
  assert.equal(resolveViewerInitialIndex(30, 24), 23);
  assert.equal(resolveViewerIndexAfterImagesChange(23, 48), 23);
  assert.equal(resolveViewerIndexAfterImagesChange(47, 24), 23);
  assert.equal(resolveViewerIndexAfterImagesChange(0, 0), null);

  const indexBeforePendingAdvance = resolveViewerIndexAfterImagesChange(23, 48);
  assert.equal(indexBeforePendingAdvance === null ? null : indexBeforePendingAdvance + 1, 24);
});

test('resolveViewerNextAction shows end prompt only after requesting next from the final image', () => {
  assert.equal(resolveViewerNextAction({
    activeIndex: 22,
    total: 24,
    hasMoreItems: false,
    canRequestMoreItems: true,
    isBusy: false,
  }), 'advance');
  assert.equal(resolveViewerNextAction({
    activeIndex: 23,
    total: 24,
    hasMoreItems: false,
    canRequestMoreItems: true,
    isBusy: false,
  }), 'show-end-prompt');
  assert.equal(resolveViewerNextAction({
    activeIndex: 23,
    total: 24,
    hasMoreItems: true,
    canRequestMoreItems: true,
    isBusy: false,
  }), 'load-more');
  assert.equal(resolveViewerNextAction({
    activeIndex: 23,
    total: 24,
    hasMoreItems: true,
    canRequestMoreItems: true,
    isBusy: true,
  }), 'none');
});

test('getTouchPointsDistance returns euclidean distance', () => {
  assert.equal(getTouchPointsDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 }), 5);
});
