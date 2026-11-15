import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./src/test/globalSetup.ts'],
    env: {
      LOG_LEVEL: 'silent',
      // Required by env validation; tests connect to the in-memory replica set instead.
      MONGO_URI: 'mongodb://127.0.0.1:1/unused-in-tests',
    },
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
