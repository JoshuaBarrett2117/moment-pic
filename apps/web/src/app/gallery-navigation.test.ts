import assert from 'node:assert/strict';
import test from 'node:test';

import { Screen } from '../types';
import { buildUrl, parseNavigationFromUrl, type GalleryFilters } from './gallery-navigation';

const baseFilters = (): GalleryFilters => ({
  page: 2,
  pageSize: 48,
  keyword: '风景',
  sortBy: 'name',
  sortOrder: 'asc',
  sourceType: 'zip',
  libraryRootId: 'root_1',
  directoryLibraryRootId: 'root_1',
  directoryRelativePath: '作者/作品',
});

const setWindowLocation = (url: string): void => {
  const parsed = new URL(url);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        pathname: parsed.pathname,
        search: parsed.search,
      },
      history: {
        state: null,
        replaceState() {},
        pushState() {},
      },
      addEventListener() {},
      removeEventListener() {},
      setTimeout,
      clearTimeout,
    },
  });
};

test('buildUrl serializes directory gallery filters and navigation state', () => {
  setWindowLocation('http://localhost/gallery');

  const url = buildUrl(baseFilters(), {
    screen: Screen.GALLERY,
    isRecentActive: true,
    galleryViewMode: 'directoryAlbums',
  });

  const params = new URLSearchParams(url.slice(1));
  assert.equal(params.get('page'), '2');
  assert.equal(params.get('pageSize'), '48');
  assert.equal(params.get('keyword'), '风景');
  assert.equal(params.get('sortBy'), 'name');
  assert.equal(params.get('sortOrder'), 'asc');
  assert.equal(params.get('sourceType'), 'zip');
  assert.equal(params.get('libraryRootId'), 'root_1');
  assert.equal(params.get('directoryLibraryRootId'), 'root_1');
  assert.equal(params.get('directoryRelativePath'), '作者/作品');
  assert.equal(params.get('view'), 'directory');
  assert.equal(params.get('recent'), '1');
});

test('buildUrl returns pathname for login screen', () => {
  setWindowLocation('http://localhost/gallery?screen=album');

  assert.equal(buildUrl(baseFilters(), { screen: Screen.LOGIN }), '/gallery');
});

test('parseNavigationFromUrl restores smart album detail state', () => {
  setWindowLocation('http://localhost/gallery?screen=smart-album&smartAlbumId=salb_1&view=smart');

  assert.deepEqual(parseNavigationFromUrl(), {
    screen: Screen.SMART_ALBUM_DETAIL,
    selectedAlbumId: null,
    selectedSmartAlbumId: 'salb_1',
    isRecentActive: false,
    galleryViewMode: 'smartAlbums',
  });
});
