import assert from 'node:assert/strict';
import test from 'node:test';

import { api } from '../lib/api';
import { fetchNetworkInfo, resetNetworkInfoCache } from '../hooks/useNetworkInfo';
import { formatNetworkStatus } from './NetworkStatusLine';

test('设置页网络状态文案', () => {
  assert.equal(formatNetworkStatus(null, false), '当前网络：检测中…');
  assert.equal(formatNetworkStatus(null, true), '当前网络：未知（按外网处理）');
  assert.equal(formatNetworkStatus({ network: 'lan', clientIp: '192.168.31.117' }, true), '当前网络：内网（192.168.31.117）');
  assert.equal(formatNetworkStatus({ network: 'wan', clientIp: '2409:8c34::1' }, true), '当前网络：外网（2409:8c34::1）');
});

test('fetchNetworkInfo：60 秒内复用结果，force 重新请求，失败 / 异常返回 null 且不缓存', async (context) => {
  resetNetworkInfoCache();
  let calls = 0;
  let next: unknown = { network: 'lan', clientIp: '192.168.31.117' };
  context.mock.method(api, 'get', () => { calls += 1; return next instanceof Error ? Promise.reject(next) : Promise.resolve(next); });
  assert.deepEqual(await fetchNetworkInfo(), { network: 'lan', clientIp: '192.168.31.117' });
  await fetchNetworkInfo();
  assert.equal(calls, 1);
  next = { network: 'wan', clientIp: '8.8.8.8' };
  assert.equal((await fetchNetworkInfo(true))?.network, 'wan');
  assert.equal(calls, 2);
  resetNetworkInfoCache();
  next = new Error('offline');
  assert.equal(await fetchNetworkInfo(), null);
  next = null;
  assert.equal(await fetchNetworkInfo(), null);
  assert.equal(calls, 4);
  resetNetworkInfoCache();
});
