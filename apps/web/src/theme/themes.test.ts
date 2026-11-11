import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DEFAULT_THEME_ID, getThemeDefinition, resolveThemeId, THEMES } from './themes';

test('默认主题是黑色磨砂玻璃', () => {
  assert.equal(DEFAULT_THEME_ID, 'glass-dark');
  assert.ok(THEMES.some((theme) => theme.id === 'glass-dark'));
});

test('未知或空的主题 id 回退到默认主题', () => {
  assert.equal(resolveThemeId('paper'), 'glass-dark');
  assert.equal(resolveThemeId(null), 'glass-dark');
  assert.equal(resolveThemeId(undefined), 'glass-dark');
  assert.equal(resolveThemeId('glass-dark'), 'glass-dark');
  assert.equal(getThemeDefinition('nope').id, 'glass-dark');
});

test('theme-init.js 与主题注册表保持一致', () => {
  const script = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8');
  for (const theme of THEMES) assert.ok(script.includes(`'${theme.id}'`), `theme-init.js 缺少 ${theme.id}`);
  assert.ok(script.includes('moment-pic:theme'));
});
