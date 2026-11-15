import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEVICE_QUALITY_MODE_KEY,
  readDeviceQualityMode,
  resolveViewerDefaultQuality,
  saveDeviceQualityMode,
} from './viewer-quality';

const base = { sessionPreset: null, deviceMode: 'follow-network', network: 'wan', lanPreset: 'original', wanPreset: 'balanced' } as const;

test('默认画质优先级：本标签页手动 > 本设备始终原图 > 内网默认 / 外网默认', () => {
  assert.deepEqual(resolveViewerDefaultQuality({ ...base }), { preset: 'balanced', source: 'wan' });
  assert.deepEqual(resolveViewerDefaultQuality({ ...base, network: 'lan' }), { preset: 'original', source: 'lan' });
  assert.deepEqual(resolveViewerDefaultQuality({ ...base, network: 'lan', lanPreset: 'high' }), { preset: 'high', source: 'lan' });
  assert.deepEqual(resolveViewerDefaultQuality({ ...base, deviceMode: 'always-original' }), { preset: 'original', source: 'device' });
  assert.deepEqual(resolveViewerDefaultQuality({ ...base, deviceMode: 'always-original', network: 'lan', lanPreset: 'low' }), { preset: 'original', source: 'device' });
  assert.deepEqual(resolveViewerDefaultQuality({ ...base, sessionPreset: 'low', deviceMode: 'always-original', network: 'lan' }), { preset: 'low', source: 'session' });
});

test('网络未知（null / undefined）按外网处理', () => {
  assert.deepEqual(resolveViewerDefaultQuality({ ...base, network: null }), { preset: 'balanced', source: 'wan' });
  assert.deepEqual(resolveViewerDefaultQuality({ ...base, network: undefined }), { preset: 'balanced', source: 'wan' });
});

test('本设备画质保存在 localStorage：跟随网络时删除键，非法值按跟随网络', () => {
  const originalWindow = globalThis.window;
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    } },
  });
  try {
    assert.equal(readDeviceQualityMode(), 'follow-network');
    saveDeviceQualityMode('always-original');
    assert.equal(store.get(DEVICE_QUALITY_MODE_KEY), 'always-original');
    assert.equal(readDeviceQualityMode(), 'always-original');
    saveDeviceQualityMode('follow-network');
    assert.equal(store.has(DEVICE_QUALITY_MODE_KEY), false);
    store.set(DEVICE_QUALITY_MODE_KEY, 'weird');
    assert.equal(readDeviceQualityMode(), 'follow-network');
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
});
