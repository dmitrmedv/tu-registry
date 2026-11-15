import type { Role } from '@tu-registry/shared';
import type { Express } from 'express';
import request, { type Response } from 'supertest';
import { SESSION_COOKIE } from '../modules/auth/auth.controller';
import { User } from '../modules/users/user.model';
import { hashPassword } from '../utils/password';

let sequence = 0;

type TestUserOptions = {
  login?: string;
  password?: string;
  role?: Role;
  canManageRegistration?: boolean;
  isActive?: boolean;
  mustChangePassword?: boolean;
};

/** Creates a user directly in the database (bypassing the API) with a known password. */
export async function createTestUser(options: TestUserOptions = {}) {
  const password = options.password ?? 'valid-password-123';
  const user = await User.create({
    login: options.login ?? `user${++sequence}`,
    fullName: 'Тестовий Користувач',
    passwordHash: await hashPassword(password),
    role: options.role ?? 'USER',
    canManageRegistration: options.canManageRegistration ?? false,
    isActive: options.isActive ?? true,
    mustChangePassword: options.mustChangePassword ?? false,
  });
  return { user, password };
}

/** Extracts "tu_session=<value>" from a response, ready for a Cookie header. */
export function sessionCookie(res: Response) {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return cookie?.split(';')[0];
}

export async function loginAs(app: Express, login: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ login, password });
  if (res.status !== 200) {
    throw new Error(`Login failed in test setup: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { accessToken: res.body.accessToken as string, cookie: sessionCookie(res)!, res };
}

/** Creates a user and logs them in. */
export async function signedInUser(app: Express, options: TestUserOptions = {}) {
  const { user, password } = await createTestUser(options);
  const session = await loginAs(app, user.login, password);
  return { user, password, ...session };
}
