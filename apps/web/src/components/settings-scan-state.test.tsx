import assert from 'node:assert/strict';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import test from 'node:test';
import { api } from '../lib/api';
import { SCAN_PARTIAL_FAILURE_MESSAGE } from '../lib/scan-status';
import { SettingsScreen } from './SettingsScreen';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('实际 Settings 页面展示部分扫描失败并触发健康相册刷新', async (context) => {
  const timers = new Map<number, () => Promise<void>>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setInterval: (callback: () => Promise<void>) => { timers.set(1, callback); return 1; },
    clearInterval: (id: number) => timers.delete(id), setTimeout, clearTimeout,
    addEventListener: () => {}, removeEventListener: () => {},
  } });
  let refreshed = 0;
  context.mock.method(api, 'get', (url: string) => Promise.resolve(url === '/library-roots' ? [{ id: 'root', name: '测试图库', path: '/isolated', enabled: true }] : null));
  context.mock.method(api, 'postWithOptions', () => Promise.resolve({ taskId: 'task', libraryRootId: 'root', status: 'running' }));
  context.mock.method(api, 'getWithOptions', (url: string) => Promise.resolve(url === '/scan' ? [] : { taskId: 'task', libraryRootId: 'root', status: 'failed', outcome: 'partial', failureCount: 1, albumsDiscovered: 1, error: 'EIO /private/failure' }));
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(createElement(SettingsScreen, { onBack: () => {}, onScanComplete: () => { refreshed += 1; } })); });
  try {
    await act(async () => { await renderer.root.findByProps({ title: '扫描此目录' }).props.onClick(); });
    await act(async () => { await timers.values().next().value!(); });
    assert.equal(renderer.root.findByProps({ role: 'alert' }).props.children, SCAN_PARTIAL_FAILURE_MESSAGE);
    assert.ok(!JSON.stringify(renderer.toJSON()).includes('/private/failure'));
    assert.equal(refreshed, 1);
  } finally { await act(async () => renderer.unmount()); }
});
