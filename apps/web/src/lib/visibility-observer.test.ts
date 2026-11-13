import assert from 'node:assert/strict';
import test from 'node:test';
import { isScrollingRecently, markScrolled, observeVisibility, observedCount, SCROLL_IDLE_MS } from './visibility-observer';

test('滚动静止判断：最近 150ms 内滚动过才算在滚动', () => {
  const now = 1_000_000;
  markScrolled(now);
  assert.equal(isScrollingRecently(now + 10), true);
  assert.equal(isScrollingRecently(now + SCROLL_IDLE_MS + 1), false);
});

test('共享观察器：所有元素共用一个 IntersectionObserver，取消后移除', () => {
  const created: FakeObserver[] = [];
  class FakeObserver {
    observed = new Set<unknown>();
    constructor(public callback: (entries: Array<{ target: unknown; isIntersecting: boolean }>) => void) { created.push(this); }
    observe(el: unknown) { this.observed.add(el); }
    unobserve(el: unknown) { this.observed.delete(el); }
    disconnect() { this.observed.clear(); }
  }
  const original = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
  try {
    const a = {} as Element;
    const b = {} as Element;
    const seen: string[] = [];
    const stopA = observeVisibility(a, (v) => seen.push(`a:${v}`));
    const stopB = observeVisibility(b, (v) => seen.push(`b:${v}`));
    assert.equal(created.length, 1);
    assert.equal(observedCount(), 2);
    created[0].callback([{ target: b, isIntersecting: true }, { target: a, isIntersecting: false }]);
    assert.deepEqual(seen, ['b:true', 'a:false']);
    stopA(); stopB();
    assert.equal(observedCount(), 0);
    assert.equal(created[0].observed.size, 0);
  } finally {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = original;
  }
});
