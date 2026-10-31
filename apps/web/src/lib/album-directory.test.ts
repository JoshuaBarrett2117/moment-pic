import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAlbumDirectoryView, resolveParentRelativePath } from './album-directory';
import type { DirectoryAlbumsDTO } from '../types/api';

const dto = (overrides: Partial<DirectoryAlbumsDTO> = {}): DirectoryAlbumsDTO => ({
  current: { name: '旅行', libraryRootId: 'root_1', relativePath: '旅行' },
  breadcrumbs: [
    { name: '目录相册', libraryRootId: null, relativePath: '' },
    { name: '我的图库', libraryRootId: 'root_1', relativePath: '' },
    { name: '旅行', libraryRootId: 'root_1', relativePath: '旅行' }
  ],
  items: [
    { id: 'album:b', name: 'B 图集', kind: 'album', libraryRootId: 'root_1', relativePath: '旅行/B', albumId: 'album_b', sourceType: 'folder', assetCount: 12, coverUrl: null, updatedAt: null, childCount: 0 },
    { id: 'dir:1', name: '东京', kind: 'directory', libraryRootId: 'root_1', relativePath: '旅行/东京', albumId: null, sourceType: null, assetCount: 0, coverUrl: null, updatedAt: null, childCount: 3 },
    { id: 'album:a', name: '10 月图集', kind: 'album', libraryRootId: 'root_1', relativePath: '旅行/10 月图集', albumId: 'album_a', sourceType: 'folder', assetCount: 4, coverUrl: null, updatedAt: null, childCount: 0 },
    { id: 'album:c', name: '空节点', kind: 'album', libraryRootId: 'root_1', relativePath: '旅行/空节点', albumId: null, sourceType: null, assetCount: 0, coverUrl: null, updatedAt: null, childCount: 0 }
  ],
  ...overrides
});

test('目录侧栏：面包屑保留层级，当前目录高亮', () => {
  const view = buildAlbumDirectoryView(dto(), 'album_a');
  assert.deepEqual(view.crumbs.map((crumb) => crumb.name), ['目录相册', '我的图库', '旅行']);
  assert.deepEqual(view.crumbs.map((crumb) => crumb.isCurrent), [false, false, true]);
});

test('目录侧栏：目录在前、图集按名称自然排序、当前图集置顶并高亮', () => {
  const view = buildAlbumDirectoryView(dto(), 'album_a');
  assert.deepEqual(view.rows.map((row) => row.name), ['10 月图集', '东京', 'B 图集']);
  assert.equal(view.rows[0].isCurrent, true);
  assert.equal(view.rows[1].kind, 'directory');
  assert.equal(view.rows[2].isCurrent, false);
});

test('目录侧栏：没有 albumId 的伪节点不参与跳转列表', () => {
  const view = buildAlbumDirectoryView(dto(), 'album_a');
  assert.ok(view.rows.every((row) => row.kind === 'directory' || row.albumId));
  assert.ok(!view.rows.some((row) => row.name === '空节点'));
});

test('目录侧栏：空数据与无当前图集时安全降级', () => {
  assert.deepEqual(buildAlbumDirectoryView(null, 'album_a'), { title: '', crumbs: [], rows: [] });
  const view = buildAlbumDirectoryView(dto(), null);
  assert.equal(view.rows.some((row) => row.isCurrent), false);
});

test('图集所在目录：去掉最后一段，zip 源同样去掉文件名', () => {
  assert.equal(resolveParentRelativePath('旅行/2026/京都'), '旅行/2026');
  assert.equal(resolveParentRelativePath('旅行'), '');
  assert.equal(resolveParentRelativePath('旅行/合集.zip'), '旅行');
  assert.equal(resolveParentRelativePath(null), '');
});
