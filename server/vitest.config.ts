import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./src/test/globalSetup.ts'],
    env: {
      LOG_LEVEL: 'silent',
      // Required by env validation; tests connect to the in-memory replica set instead.
      MONGO_URI: 'mongodb://127.0.0.1:1/unused-in-tests',
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      // Fast hashing in tests; production uses the default cost of 12.
      BCRYPT_COST: '4',
    },
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
