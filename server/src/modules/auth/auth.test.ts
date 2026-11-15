import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { env } from '../../config/env';
import { createTestUser, loginAs, sessionCookie, signedInUser } from '../../test/auth';
import { useTestDb } from '../../test/db';
import { AuditLog } from '../audit/auditLog.model';
import { User } from '../users/user.model';
import { RefreshSession } from './refreshSession.model';

const app = createApp();
const LOGIN = '/api/v1/auth/login';
const REFRESH = '/api/v1/auth/refresh';
const LOGOUT = '/api/v1/auth/logout';
const ME = '/api/v1/auth/me';
const CHANGE_PASSWORD = '/api/v1/auth/change-password';

describe('auth', () => {
  useTestDb();

  describe('POST /login', () => {
    it('returns the user and an access token and sets a hardened session cookie', async () => {
      const { user, password } = await createTestUser({ login: 'ivan' });

      const res = await request(app).post(LOGIN).send({ login: '  IVAN ', password });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({ id: user.id, login: 'ivan', role: 'USER' });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|"password"/);

      const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
      expect(cookie).toMatch(/^tu_session=/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);

      expect((await User.findById(user.id))!.lastLoginAt).toBeInstanceOf(Date);
      expect(await AuditLog.exists({ action: 'LOGIN_SUCCESS', actor: user._id })).toBeTruthy();
    });

    it.each([
      ['unknown login', async () => ({ login: 'nobody', password: 'whatever-123' })],
      [
        'wrong password',
        async () => ({ login: (await createTestUser()).user.login, password: 'wrong-pass-1' }),
      ],
      [
        'deactivated user',
        async () => {
          const { user, password } = await createTestUser({ isActive: false });
          return { login: user.login, password };
        },
      ],
    ])('rejects %s with the same generic error and audits it', async (_case, credentials) => {
      const body = await credentials();

      const res = await request(app).post(LOGIN).send(body);

      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Невірний логін або пароль',
      });
      const audit = await AuditLog.findOne({ action: 'LOGIN_FAILED' });
      expect(audit?.details).toMatchObject({ login: body.login });
      expect(JSON.stringify(audit)).not.toContain(body.password);
    });

    it('validates the request body', async () => {
      const res = await request(app).post(LOGIN).send({ login: 'ivan' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rate-limits repeated failures for the same login', async () => {
      const freshApp = createApp();
      const attempt = () =>
        request(freshApp).post(LOGIN).send({ login: 'target', password: 'wrong-pass-1' });

      for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);
      const blocked = await attempt();

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    });
  });

  describe('GET /me and access tokens', () => {
    it('returns the current user', async () => {
      const { accessToken, user } = await signedInUser(app);

      const res = await request(app).get(ME).set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: user.id, login: user.login });
      expect(res.body).not.toHaveProperty('sessionId');
    });

    it('rejects a missing token', async () => {
      expect((await request(app).get(ME)).status).toBe(401);
    });

    it('rejects forged tokens: wrong secret and alg "none"', async () => {
      const { user } = await signedInUser(app);
      const wrongSecret = jwt.sign({ sid: 'x' }, 'another-secret-another-secret-12345', {
        subject: user.id,
      });
      const algNone = jwt.sign({ sid: 'x' }, '', { subject: user.id, algorithm: 'none' });

      for (const token of [wrongSecret, algNone, 'garbage']) {
        const res = await request(app).get(ME).set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('TOKEN_INVALID');
      }
    });

    it('stops accepting a valid token as soon as the user is deactivated', async () => {
      const { accessToken, user } = await signedInUser(app);
      await User.updateOne({ _id: user._id }, { isActive: false });

      const res = await request(app).get(ME).set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_ENDED');
    });

    it('uses the configured signing secret', () => {
      expect(env.JWT_ACCESS_SECRET.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('POST /refresh', () => {
    it('rotates the session: new token and cookie, old session revoked', async () => {
      const { cookie, user } = await signedInUser(app);

      const res = await request(app).post(REFRESH).set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(user.id);
      const newCookie = sessionCookie(res);
      expect(newCookie).toBeDefined();
      expect(newCookie).not.toBe(cookie);
      expect(await RefreshSession.countDocuments({ userId: user._id, revokedAt: null })).toBe(1);
    });

    it('rejects a missing or unknown cookie', async () => {
      expect((await request(app).post(REFRESH)).status).toBe(401);
      expect((await request(app).post(REFRESH).set('Cookie', 'tu_session=forged')).status).toBe(
        401,
      );
    });

    it('rejects an expired session', async () => {
      const { cookie, user } = await signedInUser(app);
      await RefreshSession.updateMany(
        { userId: user._id },
        { expiresAt: new Date(Date.now() - 1000) },
      );

      expect((await request(app).post(REFRESH).set('Cookie', cookie)).status).toBe(401);
    });

    it('treats reuse of a rotated token as theft and ends every session', async () => {
      const { cookie: oldCookie, user } = await signedInUser(app);
      const rotated = await request(app).post(REFRESH).set('Cookie', oldCookie);
      const currentCookie = sessionCookie(rotated)!;
      // Move the rotation outside the grace window used for concurrent tabs.
      await RefreshSession.updateMany(
        { userId: user._id, revokedAt: mongoose.trusted({ $ne: null }) },
        { revokedAt: new Date(Date.now() - 60_000) },
      );

      const reuse = await request(app).post(REFRESH).set('Cookie', oldCookie);

      expect(reuse.status).toBe(401);
      expect(await RefreshSession.countDocuments({ userId: user._id, revokedAt: null })).toBe(0);
      expect((await request(app).post(REFRESH).set('Cookie', currentCookie)).status).toBe(401);
      expect(
        await AuditLog.exists({ action: 'SESSION_REUSE_DETECTED', actor: user._id }),
      ).toBeTruthy();
    });

    it('does not end other sessions when a rotated token is reused within the grace window', async () => {
      const { cookie: oldCookie } = await signedInUser(app);
      const rotated = await request(app).post(REFRESH).set('Cookie', oldCookie);

      expect((await request(app).post(REFRESH).set('Cookie', oldCookie)).status).toBe(401);
      expect((await request(app).post(REFRESH).set('Cookie', sessionCookie(rotated)!)).status).toBe(
        200,
      );
    });
  });

  describe('POST /logout', () => {
    it('ends the session: refresh and the access token stop working', async () => {
      const { cookie, accessToken, user } = await signedInUser(app);

      const res = await request(app).post(LOGOUT).set('Cookie', cookie);

      expect(res.status).toBe(204);
      expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/tu_session=;/);
      expect((await request(app).post(REFRESH).set('Cookie', cookie)).status).toBe(401);
      expect(
        (await request(app).get(ME).set('Authorization', `Bearer ${accessToken}`)).status,
      ).toBe(401);
      expect(await AuditLog.exists({ action: 'LOGOUT', actor: user._id })).toBeTruthy();
    });

    it('succeeds without a cookie', async () => {
      expect((await request(app).post(LOGOUT)).status).toBe(204);
    });
  });

  describe('temporary password flow', () => {
    it('blocks private endpoints until the password is changed', async () => {
      const { accessToken } = await signedInUser(app, { role: 'ADMIN', mustChangePassword: true });

      const blocked = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const me = await request(app).get(ME).set('Authorization', `Bearer ${accessToken}`);
      expect(me.body.mustChangePassword).toBe(true);
    });

    it('changes the password, lifts the block and ends other sessions only', async () => {
      const { user, password, accessToken, cookie } = await signedInUser(app, {
        role: 'ADMIN',
        mustChangePassword: true,
      });
      const otherDevice = await loginAs(app, user.login, password);

      const res = await request(app)
        .post(CHANGE_PASSWORD)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: password, newPassword: 'brand-new-password' });

      expect(res.status).toBe(200);
      expect(res.body.mustChangePassword).toBe(false);
      const auth = { Authorization: `Bearer ${accessToken}` };
      expect((await request(app).get('/api/v1/users').set(auth)).status).toBe(200);
      expect((await request(app).post(REFRESH).set('Cookie', cookie)).status).toBe(200);
      expect((await request(app).post(REFRESH).set('Cookie', otherDevice.cookie)).status).toBe(401);
      expect((await request(app).post(LOGIN).send({ login: user.login, password })).status).toBe(
        401,
      );
      expect(
        (await request(app).post(LOGIN).send({ login: user.login, password: 'brand-new-password' }))
          .status,
      ).toBe(200);
      expect(await AuditLog.exists({ action: 'PASSWORD_CHANGED', actor: user._id })).toBeTruthy();
    });

    it.each([
      [
        'wrong current password',
        { currentPassword: 'not-my-password', newPassword: 'another-password-1' },
        'INVALID_CURRENT_PASSWORD',
      ],
      [
        'too short',
        { currentPassword: 'valid-password-123', newPassword: 'short' },
        'VALIDATION_ERROR',
      ],
      [
        'same as current',
        { currentPassword: 'valid-password-123', newPassword: 'valid-password-123' },
        'VALIDATION_ERROR',
      ],
      [
        'same as login',
        { currentPassword: 'valid-password-123', newPassword: 'petro.ivanenko' },
        'WEAK_PASSWORD',
      ],
    ])('rejects a new password: %s', async (_case, body, code) => {
      const { accessToken } = await signedInUser(app, { login: 'petro.ivanenko' });

      const res = await request(app)
        .post(CHANGE_PASSWORD)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(code);
    });
  });
});
