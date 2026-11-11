import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNavKey } from './app-navigation';
import { parseGalleryViewParam } from './gallery-navigation';

test('导航高亮：首页、图库、最近浏览、设置', () => {
  const base = { screen: 'gallery' as const, galleryViewMode: 'albums' as const, isRecentActive: false, libraryRootId: '' };
  assert.equal(resolveNavKey({ ...base, galleryViewMode: 'home' }), 'home');
  assert.equal(resolveNavKey(base), 'albums');
  assert.equal(resolveNavKey({ ...base, libraryRootId: 'r1' }), 'library:r1');
  assert.equal(resolveNavKey({ ...base, isRecentActive: true }), 'recent');
  assert.equal(resolveNavKey({ ...base, screen: 'settings' }), 'settings');
  assert.equal(resolveNavKey({ ...base, screen: 'smart-album' }), 'smart');
});

test('网址没有 view 时进入首页，旧的最近浏览链接仍是相册列表', () => {
  assert.equal(parseGalleryViewParam(null, false), 'home');
  assert.equal(parseGalleryViewParam(null, true), 'albums');
  assert.equal(parseGalleryViewParam('albums', false), 'albums');
  assert.equal(parseGalleryViewParam('smart', false), 'smartAlbums');
});
