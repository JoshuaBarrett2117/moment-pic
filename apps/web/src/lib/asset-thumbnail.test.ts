import assert from 'node:assert/strict';
import test from 'node:test';
import { getAssetThumbnailPresentation } from './asset-thumbnail';

test('详情缩略图使用原图比例，缺失或非法尺寸预留方形', () => {
  assert.equal(getAssetThumbnailPresentation({ thumbnailUrl: '/page', width: 120, height: 300 }).aspectRatio, 0.4);
  for (const width of [null, 0, -1]) assert.equal(getAssetThumbnailPresentation({ thumbnailUrl: '/page', width, height: 300 }).aspectRatio, 1);
});

test('详情 inside 覆盖旧 fit 并保留其他查询参数', () => {
  const value = getAssetThumbnailPresentation({ thumbnailUrl: '/page?fit=cover&accessToken=token', width: null, height: null });
  assert.equal(value.fit, 'inside');
  assert.equal(value.src, '/page?fit=inside&accessToken=token');
});
