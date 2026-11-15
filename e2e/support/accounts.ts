/**
 * Test-only credentials for the throwaway E2E database (see server/src/scripts/e2eServer.ts).
 * The seeded administrator must change the initial password; global.setup.ts does that once.
 */
export const ADMIN = {
  login: 'admin',
  fullName: 'Адміністратор E2E',
  initialPassword: 'e2e-initial-admin-pass',
  password: 'e2e-admin-password-2',
};

export const API_PORT = 4100;
export const CLIENT_PORT = 5174;
