import { request, type FullConfig } from '@playwright/test';
import { apiLogin } from './support/api';
import { ADMIN } from './support/accounts';

/** The seeded administrator must change the initial password before using the app. */
export default async function globalSetup(config: FullConfig) {
  const api = await request.newContext({ baseURL: config.projects[0]!.use.baseURL });
  try {
    const headers = await apiLogin(api, { login: ADMIN.login, password: ADMIN.initialPassword });
    const response = await api.post('/api/v1/auth/change-password', {
      headers,
      data: { currentPassword: ADMIN.initialPassword, newPassword: ADMIN.password },
    });
    if (!response.ok()) throw new Error(`Admin password change failed: ${await response.text()}`);
  } finally {
    await api.dispose();
  }
}
