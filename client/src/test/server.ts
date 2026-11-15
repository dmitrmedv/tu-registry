import type { UserDto } from '@tu-registry/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * Network-level mock: tests talk to the real axios client and interceptors.
 * Defaults (restored after each test): an empty registry and no users.
 */
export const server = setupServer(
  http.get('*/api/v1/applications', () =>
    HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } }),
  ),
  http.get('*/api/v1/users/options', () => HttpResponse.json([])),
);

export function apiError(status: number, code: string, message = code) {
  return HttpResponse.json({ error: { code, message } }, { status });
}

export function makeUser(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: '6af96bac7a1158295ab39ee5',
    login: 'admin',
    fullName: 'Адміністратор Системи',
    department: 'ODESA',
    role: 'ADMIN',
    canManageRegistration: true,
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: '2026-11-15T08:22:04.485Z',
    createdAt: '2026-11-15T08:00:00.000Z',
    ...overrides,
  };
}

/** Session restore on page load succeeds as this user. */
export const signedInAs = (user: UserDto) =>
  http.post('*/api/v1/auth/refresh', () =>
    HttpResponse.json({ user, accessToken: 'test-access-token' }),
  );

/** No session cookie: the visitor is a guest. */
export const signedOut = () =>
  http.post('*/api/v1/auth/refresh', () => apiError(401, 'SESSION_ENDED', 'Сесія завершилась'));
