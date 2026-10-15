import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { AlbumCard } from './AlbumCard';

test('相册卡片显示持久化扫描错误但不直接输出内部路径或异常详情', () => {
  const html = renderToStaticMarkup(createElement(AlbumCard, {
    album: { id: 'album', name: '示例', sourceType: 'folder', assetCount: 1, coverUrl: null, isFavorite: false, updatedAt: '', scanStatus: 'error', errorMessage: 'EACCES /private/mount' },
    index: 0, isMobile: false, onNavigateToAlbum: () => {},
  }));
  assert.match(html, /扫描部分失败，已保留原图片/);
  assert.ok(!html.includes('/private/mount'));
});
