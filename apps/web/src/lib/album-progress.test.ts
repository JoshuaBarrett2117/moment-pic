import assert from 'node:assert/strict';
import test from 'node:test';
import { createProgressSaver, getProgressPage, resolveProgressItemIndex } from './album-progress';

test('阅读定位只请求第 N 张所属页，按稳定 assetId 定位而非错误旧下标', () => {
  assert.equal(getProgressPage(25), 2);
  assert.equal(getProgressPage(0), 1);
  assert.equal(resolveProgressItemIndex([{ id: 'a', sortIndex: 25 }, { id: 'b', sortIndex: 26 }], { assetId: 'b', assetIndex: 25 }), 1);
  assert.equal(resolveProgressItemIndex([{ id: 'a', sortIndex: 25 }], { assetId: 'missing', assetIndex: 24 }), null);
});

test('阅读进度 debounce 2 秒只保存最后页，flush 保存末页且失败静默', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  const saver = createProgressSaver(async (position) => { calls.push(position.assetId); if (position.assetId === 'fail') throw new Error('offline'); });
  saver.schedule({ assetId: 'first', assetIndex: 0 });
  context.mock.timers.tick(1500);
  saver.schedule({ assetId: 'last', assetIndex: 3 });
  context.mock.timers.tick(1999); await Promise.resolve(); assert.deepEqual(calls, []);
  context.mock.timers.tick(1); await saver.flush(); assert.deepEqual(calls, ['last']);
  saver.schedule({ assetId: 'fail', assetIndex: 4 }); await saver.flush();
  saver.schedule({ assetId: 'closed', assetIndex: 5 }); await saver.flush();
  assert.deepEqual(calls, ['last', 'fail', 'closed']);
  saver.schedule({ assetId: 'cancelled', assetIndex: 6 }); saver.cancel(); context.mock.timers.tick(3000); await saver.flush();
  assert.equal(calls.length, 3);
});
