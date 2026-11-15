import { expect, type APIRequestContext, type Page } from '@playwright/test';

export type Credentials = { login: string; password: string };

/** Logs in through the API; the refresh cookie lands in the request's cookie jar. */
export async function apiLogin(request: APIRequestContext, credentials: Credentials) {
  const response = await request.post('/api/v1/auth/login', {
    data: { login: credentials.login, password: credentials.password },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { accessToken } = (await response.json()) as { accessToken: string };
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Starts a page already signed in: page.request shares cookies with the browser context,
 * so the app restores the session from the refresh cookie on load. Faster than the form,
 * which has its own test in auth.spec.ts.
 *
 * Loading the app rotates the session, which ends the access token from apiLogin: make any
 * direct API calls before this.
 */
export async function signIn(page: Page, credentials: Credentials, path = '/') {
  await apiLogin(page.request, credentials);
  await page.goto(path);
}

/** Unique per call, so tests can find their own records in the shared database. */
export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type Headers = Awaited<ReturnType<typeof apiLogin>>;

/**
 * Registers an application through the API, for tests about what happens after registration
 * (registration itself is tested through the form). Call before the page loads the app.
 */
export async function createApplication(
  request: APIRequestContext,
  headers: Headers,
  overrides: Record<string, unknown> = {},
) {
  const response = await request.post('/api/v1/applications', {
    headers,
    data: {
      customer: uniqueName('ТОВ E2E'),
      phone: '+380671234567',
      settlement: 'м. Київ',
      areaType: 'URBAN',
      objectAddress: 'вул. Тестова, 1',
      objectType: 'DOMESTIC',
      objectCategory: 'RESIDENTIAL_HOUSE',
      ...overrides,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as { id: string; regNumber: string };
}

/** Opens the header's "Налаштування" menu and picks an item. */
export async function chooseSetting(page: Page, item: string) {
  await page.getByRole('button', { name: /^Налаштування/ }).click();
  await page.getByRole('menuitem', { name: item }).click();
}
