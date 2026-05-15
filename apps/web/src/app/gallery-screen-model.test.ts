import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGalleryScreenModel, resolveNextAlbumId } from './gallery-screen-model';
import type { AlbumListItemDTO, DirectoryAlbumNodeDTO, SmartAlbumListItemDTO } from '../types/api';

const album = (id: string): AlbumListItemDTO => ({
  id,
  name: id,
  sourceType: 'folder',
  assetCount: 1,
  coverUrl: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const smartAlbum = (id: string): SmartAlbumListItemDTO => ({
  id,
  name: id,
  coverUrl: null,
  albumCount: 2,
  assetCount: 10,
  status: 'active',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const directoryNode = (id: string): DirectoryAlbumNodeDTO => ({
  id,
  name: id,
  kind: 'directory',
  libraryRootId: 'root_1',
  relativePath: id,
  albumId: null,
  sourceType: null,
  assetCount: 0,
  coverUrl: null,
  updatedAt: null,
  childCount: 1,
});

test('buildGalleryScreenModel chooses smart album list and disables source filters', () => {
  const model = buildGalleryScreenModel({
    galleryViewMode: 'smartAlbums',
    isRecentActive: false,
    libraryRootId: 'root_1',
    albums: { items: [album('alb_1')], pagination: { page: 1, pageSize: 24, total: 1 } },
    recentAlbums: [album('recent_1')],
    smartAlbums: { items: [smartAlbum('salb_1')], pagination: { page: 1, pageSize: 24, total: 1 } },
    directoryAlbums: { items: [directoryNode('dir_1')] },
    isLoading: false,
    isRecentLoading: false,
    isSmartAlbumsLoading: true,
    isDirectoryAlbumsLoading: false,
  });

  assert.deepEqual(model.albums.map((item) => item.id), ['salb_1']);
  assert.equal(model.isLoading, true);
  assert.equal(model.currentLibraryRootId, '');
  assert.equal(model.canChangeSourceType, false);
});

test('buildGalleryScreenModel uses recent albums without pagination', () => {
  const model = buildGalleryScreenModel({
    galleryViewMode: 'albums',
    isRecentActive: true,
    libraryRootId: 'root_1',
    albums: { items: [album('alb_1')], pagination: { page: 1, pageSize: 24, total: 1 } },
    recentAlbums: [album('recent_1')],
    smartAlbums: null,
    directoryAlbums: null,
    isLoading: false,
    isRecentLoading: true,
    isSmartAlbumsLoading: false,
    isDirectoryAlbumsLoading: false,
  });

  assert.deepEqual(model.albums.map((item) => item.id), ['recent_1']);
  assert.equal(model.pagination, null);
  assert.equal(model.isRecentActive, true);
  assert.equal(model.currentLibraryRootId, 'root_1');
});

test('resolveNextAlbumId returns the next album or null at boundaries', () => {
  const albums = [album('alb_1'), album('alb_2')];

  assert.equal(resolveNextAlbumId(albums, 'alb_1'), 'alb_2');
  assert.equal(resolveNextAlbumId(albums, 'alb_2'), null);
  assert.equal(resolveNextAlbumId(albums, 'missing'), null);
});
