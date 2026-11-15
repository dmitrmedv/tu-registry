import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import {
  APPLICATIONS,
  type ApiSession,
  registerApplication,
  signedInWithAuth,
} from '../../test/applications';
import { useTestDb } from '../../test/db';
import { clock } from '../../utils/clock';
import { AuditLog } from '../audit/auditLog.model';
import { Counter, counterId } from '../numbering/counter.model';
import { Application } from './application.model';
import { ApplicationChange } from './applicationChange.model';

const app = createApp();

describe('DELETE /applications/:id', () => {
  useTestDb();

  let owner: ApiSession;
  let admin: ApiSession;
  beforeEach(async () => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-03-12T09:00:00Z'));
    owner = await signedInWithAuth(app, { login: 'owner' });
    admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const remove = (who: ApiSession, id: string, version?: number) =>
    request(app)
      .delete(`${APPLICATIONS}/${id}`)
      .query(version === undefined ? {} : { version })
      .set(who.auth);

  it('removes the application with its history; the audit keeps only number and date', async () => {
    const created = await registerApplication(app, owner);
    await request(app)
      .patch(`${APPLICATIONS}/${created.id}`)
      .set(owner.auth)
      .send({ phone: '0501112233', version: 1 });

    const res = await remove(admin, created.id, 2);

    expect(res.status).toBe(204);
    expect(await Application.exists({ _id: created.id })).toBeNull();
    expect(await ApplicationChange.countDocuments({ applicationId: created.id })).toBe(0);
    const entry = await AuditLog.findOne({ action: 'APPLICATION_DELETED' }).lean();
    expect(entry).toMatchObject({ actor: expect.anything(), entityType: 'Application' });
    expect(String(entry!.actor)).toBe(admin.user.id);
    expect(entry!.details).toEqual({ regNumber: created.regNumber, regDate: expect.any(String) });
    expect((await request(app).get(`${APPLICATIONS}/${created.id}`).set(admin.auth)).status).toBe(
      404,
    );
  });

  it('frees the number for manual entry but never moves the automatic counter back', async () => {
    const first = await registerApplication(app, owner);
    await registerApplication(app, owner);

    await remove(admin, first.id, 1);

    const check = await request(app)
      .get(`${APPLICATIONS}/manual/check`)
      .query({ regDate: '2026-01-02', regSeq: 1 })
      .set(admin.auth);
    expect(check.body).toMatchObject({ regNumber: '1т/26-8', available: true });
    expect((await Counter.findById(counterId(2026, 'ODESA')).lean())!.lastSeq).toBe(2);
    expect((await registerApplication(app, owner)).regNumber).toBe('3т/26-8');
  });

  it('is for administrators only, and the refusal changes nothing', async () => {
    const created = await registerApplication(app, owner);

    const res = await remove(owner, created.id, 1);

    expect(res.status).toBe(403);
    expect(await Application.exists({ _id: created.id })).not.toBeNull();
  });

  it('requires the current version, so a just-edited application is not deleted blindly', async () => {
    const created = await registerApplication(app, owner);
    await request(app)
      .patch(`${APPLICATIONS}/${created.id}`)
      .set(owner.auth)
      .send({ comment: 'Щойно змінено', version: 1 });

    expect((await remove(admin, created.id)).status).toBe(400);
    const stale = await remove(admin, created.id, 1);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(await Application.exists({ _id: created.id })).not.toBeNull();
  });

  it('answers 404 for an unknown application', async () => {
    expect((await remove(admin, '0123456789abcdef01234567', 1)).status).toBe(404);
  });

  it('shows the deleted number in the audit journal', async () => {
    const created = await registerApplication(app, owner);
    await remove(admin, created.id, 1);

    const res = await request(app)
      .get('/api/v1/audit')
      .query({ action: 'APPLICATION_DELETED' })
      .set(admin.auth);

    expect(res.body.data[0]).toMatchObject({
      entityId: created.id,
      entityLabel: created.regNumber,
    });
  });
});
