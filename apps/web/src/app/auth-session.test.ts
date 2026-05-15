import assert from 'node:assert/strict';
import test from 'node:test';

import { clearAuthSession, hasAuthSession, markAuthSession } from './auth-session';

test('auth session helpers centralize local auth marker lifecycle', () => {
  const originalWindow = globalThis.window;
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
      dispatchEvent: () => true,
    },
  });

  try {
    clearAuthSession();
    assert.equal(hasAuthSession(), false);
    markAuthSession();
    assert.equal(hasAuthSession(), true);
    clearAuthSession();
    assert.equal(hasAuthSession(), false);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
});
