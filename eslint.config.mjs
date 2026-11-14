// 根目录 flat config：`npx eslint`（或 `npm run lint`）从仓库根目录即可运行。
// 前端沿用 apps/web/eslint.config.js（通过 basePath 限定在 apps/web 内）；服务端用同一套 TS 推荐规则。
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import webConfig from './apps/web/eslint.config.js';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', 'data/**', 'tmp/**', 'apps/server/data/**', 'apps/server/samples/**'] },
  ...webConfig.map((config) => ({ ...config, basePath: 'apps/web' })),
  ...tseslint.config({
    files: ['apps/server/src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.node }, parserOptions: { tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }),
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  },
];
