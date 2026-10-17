import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import test from 'node:test';
import { albumProgressApi } from '../lib/album-progress';
import { ContinueReading } from './ContinueReading';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('首页继续阅读无数据时隐藏，有进度显示页码并点击进入原图集', async (context) => {
  const fetch = context.mock.method(albumProgressApi, 'continue', async () => ({ items: [] }));
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(createElement(ContinueReading, { onOpen: () => {} })); });
  assert.equal(renderer.toJSON(), null);
  await act(async () => renderer.unmount());
  fetch.mock.mockImplementation(async () => ({ items: [{ album: { id: 'album', name: '测试图集', sourceType: 'folder', assetCount: 40, coverUrl: null, isFavorite: false, updatedAt: '' }, progress: { assetId: 'page', assetIndex: 25, total: 40, updatedAt: '', finished: false } }] }));
  let opened = '';
  await act(async () => { renderer = create(createElement(ContinueReading, { onOpen: (id: string) => { opened = id; } })); });
  try {
    assert.match(JSON.stringify(renderer.toJSON()), /26/);
    await act(async () => renderer.root.findByType('button').props.onClick());
    assert.equal(opened, 'album');
  } finally { await act(async () => renderer.unmount()); }
});
