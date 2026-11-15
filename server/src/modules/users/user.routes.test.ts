import { Types } from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { loginAs, signedInUser } from '../../test/auth';
import { useTestDb } from '../../test/db';
import { AuditLog } from '../audit/auditLog.model';
import { RefreshSession } from '../auth/refreshSession.model';
import { User } from './user.model';

const app = createApp();
const USERS = '/api/v1/users';

async function admin() {
  const session = await signedInUser(app, { login: 'admin', role: 'ADMIN' });
  return { ...session, auth: { Authorization: `Bearer ${session.accessToken}` } };
}

describe('users API', () => {
  useTestDb();

  describe('access control', () => {
    it('requires authentication', async () => {
      expect((await request(app).get(USERS)).status).toBe(401);
    });

    it('forbids non-admins and audits the attempt', async () => {
      const { accessToken, user } = await signedInUser(app, { canManageRegistration: true });

      const res = await request(app).get(USERS).set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(403);
      expect(await AuditLog.exists({ action: 'ACCESS_DENIED', actor: user._id })).toBeTruthy();
    });

    it('applies a revoked admin role immediately', async () => {
      const { auth, user } = await admin();
      await User.updateOne({ _id: user._id }, { role: 'USER' });

      expect((await request(app).get(USERS).set(auth)).status).toBe(403);
    });
  });

  it('lists users without any password data', async () => {
    const { auth } = await admin();

    const res = await request(app).get(USERS).set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  describe('POST /users', () => {
    it('creates a user with a one-time temporary password that must be changed', async () => {
      const { auth, user: actor } = await admin();

      const res = await request(app)
        .post(USERS)
        .set(auth)
        .send({ login: 'Olena.K', fullName: 'Олена Коваль', canManageRegistration: true });

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        login: 'olena.k',
        role: 'USER',
        canManageRegistration: true,
        mustChangePassword: true,
      });
      expect(res.body.temporaryPassword).toMatch(/^\S{14}$/);

      const login = await loginAs(app, 'olena.k', res.body.temporaryPassword);
      expect(login.res.body.user.mustChangePassword).toBe(true);

      const audit = await AuditLog.findOne({ action: 'USER_CREATED', actor: actor._id });
      expect(JSON.stringify(audit)).not.toContain(res.body.temporaryPassword);
    });

    it('rejects a duplicate login', async () => {
      const { auth } = await admin();

      const res = await request(app)
        .post(USERS)
        .set(auth)
        .send({ login: 'ADMIN', fullName: 'Дубль' });

      expect(res.status).toBe(409);
    });

    it('rejects invalid data and unknown fields', async () => {
      const { auth } = await admin();

      for (const body of [
        { login: 'ok.login', fullName: 'X' },
        { login: 'кирилиця', fullName: 'Іван Іваненко' },
        { login: 'ok.login', fullName: 'Іван Іваненко', passwordHash: 'injected' },
        { login: 'ok.login', fullName: 'Іван Іваненко', role: 'SUPERUSER' },
      ]) {
        const res = await request(app).post(USERS).set(auth).send(body);
        expect(res.status).toBe(400);
      }
    });
  });

  describe('PATCH /users/:id', () => {
    it('updates fields and records what changed', async () => {
      const { auth } = await admin();
      const { user } = await signedInUser(app);

      const res = await request(app)
        .patch(`${USERS}/${user.id}`)
        .set(auth)
        .send({ fullName: 'Нове Імʼя', canManageRegistration: true });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ fullName: 'Нове Імʼя', canManageRegistration: true });
      const audit = await AuditLog.findOne({ action: 'USER_UPDATED', entityId: user._id });
      expect(audit?.details.changes).toEqual(
        expect.arrayContaining([
          { field: 'canManageRegistration', from: false, to: true },
          expect.objectContaining({ field: 'fullName' }),
        ]),
      );
    });

    it('deactivation ends all sessions of that user at once', async () => {
      const { auth } = await admin();
      const target = await signedInUser(app);

      const res = await request(app)
        .patch(`${USERS}/${target.user.id}`)
        .set(auth)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(
        await RefreshSession.countDocuments({ userId: target.user._id, revokedAt: null }),
      ).toBe(0);
      expect(
        (
          await request(app)
            .get('/api/v1/auth/me')
            .set('Authorization', `Bearer ${target.accessToken}`)
        ).status,
      ).toBe(401);
      expect(
        await AuditLog.exists({ action: 'USER_DEACTIVATED', entityId: target.user._id }),
      ).toBeTruthy();
    });

    it('does not let an admin deactivate themselves or change their own role', async () => {
      const { auth, user } = await admin();

      for (const body of [{ isActive: false }, { role: 'USER' }]) {
        const res = await request(app).patch(`${USERS}/${user.id}`).set(auth).send(body);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('CANNOT_MODIFY_SELF');
      }
    });

    it('rejects an empty update, a malformed id and an unknown id', async () => {
      const { auth, user } = await admin();

      expect((await request(app).patch(`${USERS}/${user.id}`).set(auth).send({})).status).toBe(400);
      expect(
        (await request(app).patch(`${USERS}/not-an-id`).set(auth).send({ isActive: true })).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .patch(`${USERS}/${new Types.ObjectId()}`)
            .set(auth)
            .send({ isActive: true })
        ).status,
      ).toBe(404);
    });
  });

  describe('POST /users/:id/reset-password', () => {
    it('issues a new temporary password and ends existing sessions', async () => {
      const { auth } = await admin();
      const target = await signedInUser(app);

      const res = await request(app).post(`${USERS}/${target.user.id}/reset-password`).set(auth);

      expect(res.status).toBe(200);
      expect(res.body.user.mustChangePassword).toBe(true);
      expect(
        (
          await request(app)
            .post('/api/v1/auth/login')
            .send({ login: target.user.login, password: target.password })
        ).status,
      ).toBe(401);
      expect(
        (await request(app).post('/api/v1/auth/refresh').set('Cookie', target.cookie)).status,
      ).toBe(401);
      await loginAs(app, target.user.login, res.body.temporaryPassword);
      expect(
        await AuditLog.exists({ action: 'PASSWORD_RESET', entityId: target.user._id }),
      ).toBeTruthy();
    });
  });
});
