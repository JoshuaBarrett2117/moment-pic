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

test('最近浏览不受残留关键词与筛选影响，且空态使用浏览语义文案', () => {
  // 最近浏览视图不消费关键词/筛选：即便这些值还挂着，也不算「有效筛选」
  assert.equal(hasGalleryActiveFilters({
    isRecentActive: true,
    currentKeyword: '残留关键词',
    currentSortBy: 'name',
    currentSortOrder: 'asc',
    currentPageSize: 50,
    currentSourceType: 'zip',
    currentLibraryRootId: 'root_1',
    displayMode: 'albums',
  }), false);

  // 同一组条件在普通相册列表下仍应判定为有效筛选（防回归）
  assert.equal(hasGalleryActiveFilters({
    isRecentActive: false,
    currentKeyword: '残留关键词',
    currentSortBy: 'name',
    currentSortOrder: 'asc',
    currentPageSize: 50,
    currentSourceType: 'zip',
    currentLibraryRootId: 'root_1',
    displayMode: 'albums',
  }), true);

  // 最近浏览空态不得复用「没有找到匹配的相册」这类搜索空态文案
  assert.deepEqual(resolveGalleryEmptyText({
    displayMode: 'albums',
    isRecentActive: true,
    hasActiveFilters: false,
  }), {
    title: '还没有浏览记录',
    description: '打开一个图集后，就会出现在这里。',
  });

  // 普通列表空态保持原有搜索语义
  assert.deepEqual(resolveGalleryEmptyText({
    displayMode: 'albums',
    hasActiveFilters: true,
  }), {
    title: '没有找到匹配的相册',
    description: '试试清空筛选条件，或者换一个关键词。',
  });
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
