import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveGalleryAlbumCardKind } from './gallery-album-card-kind';
import type { AlbumListItemDTO, DirectoryAlbumNodeDTO, SmartAlbumListItemDTO } from '../../types/api';

const album: AlbumListItemDTO = {
  id: 'alb_1',
  name: '普通图集',
  sourceType: 'folder',
  assetCount: 12,
  coverUrl: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const smartAlbum: SmartAlbumListItemDTO = {
  id: 'salb_1',
  name: '自动整理',
  coverUrl: null,
  albumCount: 3,
  assetCount: 120,
  status: 'active',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const directoryNode: DirectoryAlbumNodeDTO = {
  id: 'dir_1',
  name: '目录',
  kind: 'directory',
  libraryRootId: 'root_1',
  relativePath: '作者',
  albumId: null,
  sourceType: null,
  assetCount: 0,
  coverUrl: null,
  updatedAt: null,
  childCount: 4,
};

test('resolveGalleryAlbumCardKind dispatches supported gallery item variants', () => {
  assert.equal(resolveGalleryAlbumCardKind(directoryNode, false), 'directory');
  assert.equal(resolveGalleryAlbumCardKind(smartAlbum, true), 'smartAlbum');
  assert.equal(resolveGalleryAlbumCardKind(album, false), 'album');
});

test('resolveGalleryAlbumCardKind rejects smart albums outside smart album mode', () => {
  assert.equal(resolveGalleryAlbumCardKind(smartAlbum, false), 'unsupported');
});
