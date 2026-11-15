import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { signedInUser } from '../../test/auth';
import { useTestDb } from '../../test/db';
import { Application } from '../applications/application.model';
import { AuditLog } from './auditLog.model';

const app = createApp();
const AUDIT = '/api/v1/audit';

describe('audit journal API', () => {
  useTestDb();

  let adminAuth: { Authorization: string };
  let adminId: string;

  beforeEach(async () => {
    const admin = await signedInUser(app, { login: 'boss', role: 'ADMIN' });
    adminAuth = { Authorization: `Bearer ${admin.accessToken}` };
    adminId = admin.user.id;
    // Start each test from a known journal (signing in already wrote LOGIN_SUCCESS).
    await AuditLog.deleteMany({});
  });

  it('is available to administrators only', async () => {
    const regular = await signedInUser(app, { login: 'regular' });

    const res = await request(app).get(AUDIT).set('Authorization', `Bearer ${regular.accessToken}`);

    expect(res.status).toBe(403);
    expect((await request(app).get(AUDIT)).status).toBe(401);
  });

  it('lists newest first with actor names and readable objects', async () => {
    const application = await Application.create({
      regYear: 2026,
      regSeq: 7,
      regDate: new Date('2026-03-01T00:00:00Z'),
      customer: 'ТОВ',
      phone: '+380671234567',
      objectAddress: 'Адреса',
      objectType: 'DOMESTIC',
      objectCategory: 'RESIDENTIAL_HOUSE',
      registrationMode: 'AUTO',
      createdBy: adminId,
    });
    await AuditLog.create({
      action: 'APPLICATION_CREATED',
      actor: adminId,
      entityType: 'Application',
      entityId: application._id,
      details: { regNumber: '7т/26' },
      createdAt: new Date('2026-03-01T10:00:00Z'),
    });
    await AuditLog.create({
      action: 'USER_UPDATED',
      actor: adminId,
      entityType: 'User',
      entityId: adminId,
      createdAt: new Date('2026-03-02T10:00:00Z'),
    });

    const res = await request(app).get(AUDIT).set(adminAuth);

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ total: 2, page: 1 });
    expect(res.body.data.map((e: { action: string }) => e.action)).toEqual([
      'USER_UPDATED',
      'APPLICATION_CREATED',
    ]);
    expect(res.body.data[0]).toMatchObject({ entityLabel: 'boss', actor: { login: 'boss' } });
    expect(res.body.data[1]).toMatchObject({
      entityLabel: '7т/26',
      details: { regNumber: '7т/26' },
    });
  });

  it('filters by action, actor and Kyiv calendar days', async () => {
    const other = await signedInUser(app, { login: 'someone' });
    await AuditLog.deleteMany({});
    await AuditLog.create([
      // 23:30 on 1 March in Kyiv (UTC+2) is still 1 March there.
      { action: 'LOGIN_SUCCESS', actor: adminId, createdAt: new Date('2026-03-01T21:30:00Z') },
      // 00:30 on 2 March in Kyiv.
      {
        action: 'LOGIN_SUCCESS',
        actor: other.user.id,
        createdAt: new Date('2026-03-01T22:30:00Z'),
      },
      { action: 'LOGIN_FAILED', actor: null, createdAt: new Date('2026-03-02T08:00:00Z') },
    ]);

    const byAction = await request(app).get(AUDIT).query({ action: 'LOGIN_FAILED' }).set(adminAuth);
    const byActor = await request(app).get(AUDIT).query({ actor: other.user.id }).set(adminAuth);
    const firstOfMarch = await request(app)
      .get(AUDIT)
      .query({ dateFrom: '2026-03-01', dateTo: '2026-03-01' })
      .set(adminAuth);

    expect(byAction.body.meta.total).toBe(1);
    expect(byAction.body.data[0].actor).toBeNull();
    expect(byActor.body.meta.total).toBe(1);
    expect(firstOfMarch.body.meta.total).toBe(1);
    expect(firstOfMarch.body.data[0].actor.id).toBe(adminId);
  });

  it('validates the query', async () => {
    for (const query of [{ action: 'DELETE_EVERYTHING' }, { actor: 'x' }, { limit: 1000 }]) {
      expect((await request(app).get(AUDIT).query(query).set(adminAuth)).status).toBe(400);
    }
  });

  it('offers no way to change or delete entries', async () => {
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      expect((await request(app)[method](AUDIT).set(adminAuth)).status).toBe(404);
    }
  });
});
