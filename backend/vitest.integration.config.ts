import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globals: false,
    setupFiles: [],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
