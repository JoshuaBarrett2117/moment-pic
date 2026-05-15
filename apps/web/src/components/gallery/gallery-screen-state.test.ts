import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getGallerySortOptions,
  hasGalleryActiveFilters,
  resolveGalleryEmptyText,
  resolveGalleryHeaderText,
} from './gallery-screen-state';

test('hasGalleryActiveFilters ignores library roots outside normal album mode', () => {
  assert.equal(hasGalleryActiveFilters({
    currentKeyword: '',
    currentSortBy: 'updatedAt',
    currentSortOrder: 'desc',
    currentPageSize: 24,
    currentSourceType: '',
    currentLibraryRootId: 'root_1',
    displayMode: 'smartAlbums',
  }), false);

  assert.equal(hasGalleryActiveFilters({
    currentKeyword: '',
    currentSortBy: 'updatedAt',
    currentSortOrder: 'desc',
    currentPageSize: 24,
    currentSourceType: '',
    currentLibraryRootId: 'root_1',
    displayMode: 'albums',
  }), true);
});

test('getGallerySortOptions exposes album count only for smart album mode', () => {
  assert.deepEqual(getGallerySortOptions('smartAlbums').map((option) => option.value), [
    'updatedAt',
    'name',
    'albumCount',
    'assetCount',
  ]);
  assert.deepEqual(getGallerySortOptions('directoryAlbums').map((option) => option.value), [
    'name',
    'updatedAt',
    'assetCount',
  ]);
});

test('gallery copy helpers respect overrides and mode defaults', () => {
  assert.deepEqual(resolveGalleryHeaderText({
    displayMode: 'directoryAlbums',
  }), {
    title: '目录相册',
    description: '按图库根目录逐层进入，直到抵达真正的图集。',
  });

  assert.deepEqual(resolveGalleryEmptyText({
    displayMode: 'albums',
    hasActiveFilters: true,
    emptyTitle: '自定义空态',
  }), {
    title: '自定义空态',
    description: '试试清空筛选条件，或者换一个关键词。',
  });
});
