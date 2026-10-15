import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react-test-renderer';
import { api } from '../lib/api';
import { SCAN_FAILURE_MESSAGE, SCAN_PARTIAL_FAILURE_MESSAGE } from '../lib/scan-status';
import { deferred, renderHook } from './hook-test-renderer';
import { useLibraryScan } from './useLibraryScan';
import type { ScanResultDTO } from '../types/api';

const task = (status: ScanResultDTO['status'], outcome: ScanResultDTO['outcome'] = 'partial'): ScanResultDTO => ({ taskId: 'task', libraryRootId: 'root', status, outcome, failureCount: status === 'failed' ? 1 : 0, createdAt: '', startedAt: '', finishedAt: '', error: 'EIO /private/failure', albumsDiscovered: outcome === 'partial' ? 1 : 0, assetsDiscovered: 1 });
const setup = () => {
  let nextId = 0;
  const timers = new Map<number, () => Promise<void>>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setInterval: (callback: () => Promise<void>) => { nextId += 1; timers.set(nextId, callback); return nextId; },
    clearInterval: (id: number) => timers.delete(id),
  } });
  return timers;
};

for (const outcome of ['failed', 'partial'] as const) {
  test(`实际扫描 Hook：${outcome} 轮询结束仍刷新健康结果，并显示脱敏失败`, async (context) => {
    const timers = setup();
    let refreshed = 0;
    context.mock.method(api, 'postWithOptions', () => Promise.resolve(task('running')));
    context.mock.method(api, 'getWithOptions', (url: string) => Promise.resolve(url === '/scan' ? [] : task('failed', outcome)));
    const hook = await renderHook(() => useLibraryScan({ onScanComplete: () => { refreshed += 1; } }));
    try {
      await act(async () => { await hook.current.scan('root'); });
      assert.equal(hook.current.isAnyScanning, true);
      await act(async () => { await timers.values().next().value!(); });
      assert.equal(hook.current.isAnyScanning, false);
      assert.equal(hook.current.scanError, outcome === 'partial' ? SCAN_PARTIAL_FAILURE_MESSAGE : SCAN_FAILURE_MESSAGE);
      assert.equal(refreshed, 1);
      assert.equal(timers.size, 0);
    } finally { await hook.unmount(); }
  });
}

test('实际扫描 Hook：并发重复请求只发一次，清除/卸载取消，迟到成功/错误不能恢复轮询', async (context) => {
  const timers = setup();
  const pending: Array<ReturnType<typeof deferred<ScanResultDTO>> & { signal: AbortSignal }> = [];
  context.mock.method(api, 'getWithOptions', () => Promise.resolve([]));
  context.mock.method(api, 'postWithOptions', (_url: string, _data: unknown, options: { signal: AbortSignal }) => {
    const request = { ...deferred<ScanResultDTO>(), signal: options.signal };
    pending.push(request);
    return request.promise;
  });
  const hook = await renderHook(() => useLibraryScan());
  let first!: Promise<ScanResultDTO | null>;
  await act(async () => { first = hook.current.scan('root'); assert.equal(await hook.current.scan('root'), null); });
  assert.equal(pending.length, 1);
  await act(async () => hook.current.clearScanTask('root'));
  assert.equal(pending[0].signal.aborted, true);
  await act(async () => { pending[0].resolve(task('running')); await first; });
  assert.equal(timers.size, 0);
  let second!: Promise<ScanResultDTO | null>;
  await act(async () => { second = hook.current.scan('root'); });
  await hook.unmount();
  assert.equal(pending[1].signal.aborted, true);
  const renders = hook.renders;
  await act(async () => { pending[1].reject(new Error('late /private/failure')); await second; });
  assert.equal(hook.renders, renders);
  assert.equal(timers.size, 0);
});

test('实际扫描 Hook：轮询不重叠，迟到轮询与恢复请求不能覆盖新任务', async (context) => {
  const timers = setup();
  const restore = deferred<ScanResultDTO[]>();
  const poll = deferred<ScanResultDTO>();
  let pollSignal: AbortSignal | undefined;
  let polled = 0;
  context.mock.method(api, 'getWithOptions', (url: string, _params: unknown, options: { signal: AbortSignal }) => {
    if (url === '/scan') return restore.promise;
    pollSignal = options.signal;
    polled += 1;
    return poll.promise;
  });
  context.mock.method(api, 'postWithOptions', () => Promise.resolve(task('running')));
  const hook = await renderHook(() => useLibraryScan());
  try {
    await act(async () => { await hook.current.scan('root'); });
    const callback = timers.values().next().value!;
    let polling!: Promise<void>;
    await act(async () => { polling = callback(); await callback(); });
    assert.equal(polled, 1);
    await act(async () => hook.current.clearScanTask('root'));
    assert.equal(pollSignal?.aborted, true);
    await act(async () => { poll.resolve(task('failed')); await polling; restore.resolve([task('running')]); });
    assert.equal(hook.current.scanError, null);
    assert.equal(hook.current.isAnyScanning, false);
    assert.equal(timers.size, 0);
  } finally { await hook.unmount(); }
});

test('实际扫描 Hook：连续轮询故障可见且不会泄漏错误详情', async (context) => {
  const timers = setup();
  let refreshed = 0;
  context.mock.method(api, 'getWithOptions', (url: string) => url === '/scan' ? Promise.resolve([task('running')]) : Promise.reject(new Error('EIO /private/failure')));
  const hook = await renderHook(() => useLibraryScan({ onScanComplete: () => { refreshed += 1; } }));
  try {
    const callback = timers.values().next().value!;
    for (let index = 0; index < 3; index += 1) await act(async () => { await callback(); });
    assert.equal(hook.current.scanError, SCAN_FAILURE_MESSAGE);
    assert.equal(refreshed, 1);
    assert.equal(timers.size, 0);
  } finally { await hook.unmount(); }
});

test('实际扫描 Hook：请求层取消不留下永久 pending 或阻止下一次扫描', async (context) => {
  setup();
  context.mock.method(api, 'getWithOptions', () => Promise.resolve([]));
  let posted = 0;
  context.mock.method(api, 'postWithOptions', () => {
    posted += 1;
    return posted === 1 ? Promise.reject(new DOMException('取消', 'AbortError')) : Promise.resolve(task('completed', 'complete'));
  });
  const hook = await renderHook(() => useLibraryScan());
  try {
    await act(async () => { assert.equal(await hook.current.scan('root'), null); });
    assert.equal(hook.current.scanError, null);
    assert.equal(hook.current.isAnyScanning, false);
    await act(async () => { assert.ok(await hook.current.scan('root')); });
    assert.equal(posted, 2);
  } finally { await hook.unmount(); }
});
