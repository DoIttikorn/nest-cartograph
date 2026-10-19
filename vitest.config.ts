import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Building a TypeScript program takes a few seconds on a cold start.
    testTimeout: 30_000,
  },
});
