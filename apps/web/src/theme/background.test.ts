import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isValidCustomBackgroundUrl, resolveBackgroundMode, resolveEffectiveBackground } from './background';

test('自定义背景地址只接受服务端返回的带版本格式', () => {
  assert.equal(isValidCustomBackgroundUrl('/api/v1/account/background?v=0123456789ab'), true);
  assert.equal(isValidCustomBackgroundUrl('/api/v1/account/background'), false);
  assert.equal(isValidCustomBackgroundUrl('https://evil.example/x.jpg'), false);
  assert.equal(isValidCustomBackgroundUrl('/api/v1/account/background?v=abc");}'), false);
});

test('背景模式：未知值回退默认；未登录时不加载自定义图片', () => {
  assert.equal(resolveBackgroundMode('nope'), 'default');
  assert.equal(resolveBackgroundMode('none'), 'none');
  const url = '/api/v1/account/background?v=0123456789ab';
  assert.deepEqual(resolveEffectiveBackground({ mode: 'custom', customUrl: url, active: false }), { kind: 'default' });
  assert.deepEqual(resolveEffectiveBackground({ mode: 'custom', customUrl: url, active: true }), { kind: 'custom', url });
  assert.deepEqual(resolveEffectiveBackground({ mode: 'custom', customUrl: null, active: true }), { kind: 'default' });
  assert.deepEqual(resolveEffectiveBackground({ mode: 'none', customUrl: url, active: true }), { kind: 'none' });
});

test('theme-init.js 与背景存储键、地址校验保持一致', () => {
  const script = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8');
  assert.ok(script.includes('moment-pic:bg-mode'));
  assert.ok(script.includes('moment-pic:bg-url'));
  assert.ok(script.includes('auth_token'));
  assert.ok(script.includes('[0-9a-f]{12}'));
});
