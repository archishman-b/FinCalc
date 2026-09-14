import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Globals that must never appear in @fincalc/engine or @fincalc/data.
// The packages are pure TypeScript: zero DOM, zero React, zero I/O — the Expo
// app (Phase 10) only stays cheap if this boundary is never crossed.
const BROWSER_AND_IO_GLOBALS = [
  'window', 'document', 'navigator', 'location', 'history', 'localStorage',
  'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'Worker', 'requestAnimationFrame', 'alert', 'confirm', 'prompt',
  'process', 'Buffer', 'require', '__dirname', '__filename',
];

const PURE_PACKAGE_FILES = ['packages/engine/**/*.ts', 'packages/data/**/*.ts'];

const reactHooksRecommended =
  reactHooks.configs?.flat?.recommended ?? reactHooks.configs['recommended-latest'];

export default defineConfig([
  { ignores: ['**/dist/**', 'docs/**', '**/node_modules/**', 'apps/mobile/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: PURE_PACKAGE_FILES,
    rules: {
      'no-restricted-globals': ['error', ...BROWSER_AND_IO_GLOBALS],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'react-native', 'react-native/*'], message: 'The engine and data packages must not import React.' },
            { group: ['node:*', 'fs', 'path', 'os', 'child_process', 'http', 'https', 'net', 'crypto', 'worker_threads'], message: 'The engine and data packages must not perform I/O.' },
            { group: ['@fincalc/ui', '@fincalc/ui/*', '@fincalc/web', '@fincalc/web/*'], message: 'Dependencies point one way: ui and web import the engine, never the reverse.' },
            { group: ['zustand', 'zustand/*', 'recharts', 'recharts/*'], message: 'UI state and charting stay out of the engine.' },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooksRecommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['**/*.config.{js,ts}', '.github/**'],
    languageOptions: { globals: { ...globals.node } },
  },
]);
