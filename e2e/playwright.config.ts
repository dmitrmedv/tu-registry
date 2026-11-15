import { defineConfig, devices } from '@playwright/test';
import { ADMIN, API_PORT, CLIENT_PORT } from './support/accounts';

const baseURL = `http://localhost:${CLIENT_PORT}`;

export default defineConfig({
  testDir: './tests',
  // All tests share one database (and one numbering counter), so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './global.setup.ts',
  use: {
    baseURL,
    locale: 'uk-UA',
    timezoneId: 'Europe/Kyiv',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run e2e:server -w server',
      cwd: '..',
      url: `http://localhost:${API_PORT}/api/health`,
      // Never reuse: a fresh in-memory database per run keeps the tests independent of history.
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      env: {
        NODE_ENV: 'test',
        API_PORT: String(API_PORT),
        LOG_LEVEL: 'warn',
        // Fast hashing for throwaway accounts; production uses the default cost of 12.
        BCRYPT_COST: '4',
        SEED_ADMIN_LOGIN: ADMIN.login,
        SEED_ADMIN_NAME: ADMIN.fullName,
        SEED_ADMIN_PASSWORD: ADMIN.initialPassword,
      },
    },
    {
      command: `npm run dev -w client -- --port ${CLIENT_PORT}`,
      cwd: '..',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
