import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // src/core has no DOM, so unit tests run without one
    include: ['tests/unit/**/*.test.ts'],
  },
});
