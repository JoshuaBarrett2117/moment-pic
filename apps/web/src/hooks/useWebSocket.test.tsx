import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react-test-renderer';
import { api } from '../lib/api';
import { deferred, renderHook } from './hook-test-renderer';
import { useWebSocket } from './useWebSocket';

class SocketDouble {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: SocketDouble[] = [];
  readyState = 0;
  onopen?: () => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  constructor(readonly url: string) { SocketDouble.instances.push(this); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
}

const setup = () => {
  SocketDouble.instances = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let expired = 0;
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: SocketDouble });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { protocol: 'https:', host: 'photos.example', hostname: 'photos.example' },
    localStorage: { removeItem: () => {} },
    dispatchEvent: () => { expired += 1; },
    setTimeout: (callback: () => void) => { timerId += 1; timers.set(timerId, callback); return timerId; },
  } });
  return { timers, get expired() { return expired; } };
};

test('真实 WebSocket Hook：未登录不连，退出/卸载后 close 回调不能复活连接', async (context) => {
  const state = setup();
  context.mock.method(api, 'get', () => Promise.resolve({ authenticated: true }));
  let enabled = false;
  const hook = await renderHook(() => useWebSocket(undefined, undefined, enabled));
  assert.equal(SocketDouble.instances.length, 0);
  enabled = true;
  await hook.rerender();
  const socket = SocketDouble.instances[0];
  assert.equal(socket.url, 'wss://photos.example/ws');
  await act(async () => { socket.readyState = 1; socket.onopen?.(); });
  assert.equal(hook.current.isConnected, true);
  enabled = false;
  await hook.rerender();
  assert.equal(hook.current.isConnected, false);
  assert.equal(state.timers.size, 0);
  await hook.unmount();
  assert.equal(SocketDouble.instances.length, 1);
});

test('真实 WebSocket Hook：网络断开可重连，但会话过期通知登录且停止重试', async (context) => {
  const state = setup();
  context.mock.method(api, 'get', () => Promise.resolve({ authenticated: true }));
  const hook = await renderHook(() => useWebSocket(undefined, undefined, true));
  try {
    await act(async () => SocketDouble.instances[0].onclose?.({ code: 1006 }));
    assert.equal(state.timers.size, 1);
    await act(async () => { state.timers.values().next().value!(); });
    assert.equal(SocketDouble.instances.length, 2);
    const previousTimerCount = state.timers.size;
    await act(async () => SocketDouble.instances[1].onclose?.({ code: 4001 }));
    assert.equal(state.expired, 1);
    assert.equal(state.timers.size, previousTimerCount);
  } finally { await hook.unmount(); }
});

test('真实 WebSocket Hook：握手前探测过期会话，未完成探测在卸载后不可连接', async (context) => {
  const state = setup();
  context.mock.method(api, 'get', () => Promise.reject(Object.assign(new Error('expired'), { response: { status: 401 } })));
  const expired = await renderHook(() => useWebSocket(undefined, undefined, true));
  assert.equal(SocketDouble.instances.length, 0);
  assert.equal(state.expired, 1);
  assert.equal(state.timers.size, 0);
  await expired.unmount();
  const pending = deferred();
  context.mock.method(api, 'get', () => pending.promise);
  const unmounted = await renderHook(() => useWebSocket(undefined, undefined, true));
  await unmounted.unmount();
  await act(async () => pending.resolve({ authenticated: true }));
  assert.equal(SocketDouble.instances.length, 0);
});
