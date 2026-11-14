import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import test from 'node:test';
import {
  GALLERY_CASCADE_LIMIT,
  galleryCardItemVariants,
  galleryGridContainerVariants,
  getGalleryCardEntranceDelay,
  resetGalleryEntrancesForTest,
  useGalleryEntrance,
} from './gallery-card-motion';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Resolver = (custom: unknown) => { opacity?: number; transition?: { delay?: number; duration?: number } };

test('卡片入场只对前 12 张级联，之后的卡片直接以最终状态出现', () => {
  assert.equal(GALLERY_CASCADE_LIMIT, 12);
  assert.equal(getGalleryCardEntranceDelay(0), 0);
  assert.equal(getGalleryCardEntranceDelay(11), 11 * 0.05);
  assert.equal(getGalleryCardEntranceDelay(12), 0);
  assert.equal(getGalleryCardEntranceDelay(500), 0);
  const hidden = galleryCardItemVariants.hidden as unknown as Resolver;
  const show = galleryCardItemVariants.show as unknown as Resolver;
  assert.equal(hidden(3).opacity, 0);
  assert.equal(hidden(12).opacity, 1, '第 13 张起不做入场动画');
  assert.equal(show(3).transition?.delay, 3 * 0.05);
  assert.equal(show(40).transition?.duration, 0);
  // 容器不再用 staggerChildren 无上限累加
  assert.equal(JSON.stringify(galleryGridContainerVariants).includes('stagger'), false);
});

test('同一区域的入场动画本次会话只播一次，返回时不重放', async () => {
  resetGalleryEntrancesForTest();
  const seen: Array<'hidden' | false> = [];
  const Probe = ({ name }: { name: string }) => {
    seen.push(useGalleryEntrance(name));
    return null;
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(createElement(Probe, { name: 'home:最近更新' })); });
  await act(async () => renderer.unmount());
  await act(async () => { renderer = create(createElement(Probe, { name: 'home:最近更新' })); });
  await act(async () => renderer.unmount());
  await act(async () => { renderer = create(createElement(Probe, { name: 'home:收藏' })); });
  await act(async () => renderer.unmount());
  assert.deepEqual(seen, ['hidden', false, 'hidden']);
});
