import { defineConfig } from 'vitest/config';

// One root config for the whole monorepo. Engine, data and ui tests are pure
// TypeScript and run in Node; a web test that needs a DOM opts in per file with
// `// @vitest-environment jsdom` once that dependency is added.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    reporters: 'default',
  },
});
