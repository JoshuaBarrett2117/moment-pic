import assert from 'node:assert/strict';
import test from 'node:test';

import { readViewerQualityPreset, saveViewerQualityPreset } from './viewer-quality-session';

test('viewer quality session ignores unsupported values and persists valid presets', () => {
  const originalWindow = globalThis.window;
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    },
  });

  try {
    store.set('viewer_quality_preset', 'unsupported');
    assert.equal(readViewerQualityPreset(), null);
    saveViewerQualityPreset('balanced');
    assert.equal(readViewerQualityPreset(), 'balanced');
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
});
