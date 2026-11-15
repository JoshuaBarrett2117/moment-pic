import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ViewerEndPrompt, type ViewerNextAlbumStatus } from './ViewerEndPrompt';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const render = async (status: ViewerNextAlbumStatus, onEnterNextAlbum = () => {}) => {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(ViewerEndPrompt, { nextAlbumStatus: status, onDismiss: () => {}, onEnterNextAlbum }));
  });
  const buttons = renderer!.root.findAllByType('button');
  const texts = buttons.map((button) => [button.props.children].flat().join(''));
  return { renderer: renderer!, buttons, texts };
};

test('结束弹窗：有下一个图集时显示可点的「进入下一个图集」', async () => {
  let entered = 0;
  const { buttons, texts, renderer } = await render('ready', () => { entered += 1; });
  assert.deepEqual(texts, ['取消', '进入下一个图集']);
  assert.equal(buttons[1].props.disabled, false);
  await act(async () => { buttons[1].props.onClick(); });
  assert.equal(entered, 1);
  await act(async () => renderer.unmount());
});

test('结束弹窗：还在确认下一个图集时按钮不消失，只是暂时禁用', async () => {
  const { buttons, texts, renderer } = await render('loading');
  assert.deepEqual(texts, ['取消', '正在查找下一个图集…']);
  assert.equal(buttons[1].props.disabled, true);
  await act(async () => renderer.unmount());
});

test('结束弹窗：确实是最后一个图集时只有「知道了」', async () => {
  const { texts, renderer } = await render('none');
  assert.deepEqual(texts, ['知道了']);
  await act(async () => renderer.unmount());
});
