import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSmartAlbumMemberAlbums, resolveSmartAlbumMemberSortBy } from './smart-album-member-albums';
import type { GalleryFilters } from './gallery-navigation';
import type { SmartAlbumMemberDTO } from '../types/api';

const baseFilters = (overrides: Partial<GalleryFilters> = {}): GalleryFilters => ({
  page: 1,
  pageSize: 24,
  keyword: '',
  sortBy: 'updatedAt',
  sortOrder: 'desc',
  sourceType: '',
  libraryRootId: '',
  directoryLibraryRootId: '',
  directoryRelativePath: '',
  ...overrides,
});

const members: SmartAlbumMemberDTO[] = [
  {
    albumId: 'alb_1',
    name: '山景写真',
    sourceType: 'folder',
    assetCount: 12,
    coverUrl: '/cover/1',
    updatedAt: '2026-01-02T00:00:00.000Z',
    sourceEngine: 'rule',
    confidence: 1,
  },
  {
    albumId: 'alb_2',
    name: '海边旅拍',
    sourceType: 'zip',
    assetCount: 8,
    coverUrl: '/cover/2',
    updatedAt: '2026-01-03T00:00:00.000Z',
    sourceEngine: 'ai',
    confidence: 0.9,
  },
  {
    albumId: 'alb_3',
    name: '山路记录',
    sourceType: 'folder',
    assetCount: 30,
    coverUrl: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    sourceEngine: 'manual',
    confidence: 1,
  },
];

test('buildSmartAlbumMemberAlbums filters by keyword and source type', () => {
  const albums = buildSmartAlbumMemberAlbums(members, baseFilters({
    keyword: '山',
    sourceType: 'folder',
    sortBy: 'name',
    sortOrder: 'asc',
  }));

  assert.deepEqual(albums.map((album) => album.id), ['alb_1', 'alb_3']);
});

test('buildSmartAlbumMemberAlbums falls back albumCount sorting to updatedAt', () => {
  const albums = buildSmartAlbumMemberAlbums(members, baseFilters({
    sortBy: 'albumCount',
    sortOrder: 'desc',
  }));

  assert.equal(resolveSmartAlbumMemberSortBy('albumCount'), 'updatedAt');
  assert.deepEqual(albums.map((album) => album.id), ['alb_2', 'alb_1', 'alb_3']);
});
