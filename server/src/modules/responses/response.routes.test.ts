import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
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
import { Engineer } from '../engineers/engineer.model';
import { ApplicationResponse } from './response.model';

const app = createApp();

describe('responses to an application', () => {
  useTestDb();

  let now: MockInstance<() => Date>;
  let owner: ApiSession;
  let colleague: ApiSession;
  let elsewhere: ApiSession;
  let admin: ApiSession;
  let applicationId: string;
  let engineerId: string;

  beforeEach(async () => {
    // Registered on Monday 02.11.2026; the responses come later.
    now = vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-02T09:00:00Z'));
    owner = await signedInWithAuth(app, { login: 'owner' });
    colleague = await signedInWithAuth(app, { login: 'colleague' });
    elsewhere = await signedInWithAuth(app, { login: 'elsewhere', department: 'RENI' });
    admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
    applicationId = (await registerApplication(app, owner)).id;
    engineerId = String(
      (
        await Engineer.create({
          fullName: 'Бойко Андрій',
          department: 'ODESA',
          createdBy: admin.user._id,
        })
      )._id,
    );
    now.mockReturnValue(new Date('2026-11-20T09:00:00Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const url = (path = '') => `${APPLICATIONS}/${applicationId}/responses${path}`;
  const add = (body: Record<string, unknown> = {}, who = owner) =>
    request(app)
      .post(url())
      .set(who.auth)
      .send({
        outgoingNumber: '125/01-15',
        responseDate: '2026-11-06',
        engineer: engineerId,
        ...body,
      });
  const list = (who = owner) => request(app).get(url()).set(who.auth);
  const patch = (id: string, body: Record<string, unknown>, who = owner) =>
    request(app)
      .patch(url(`/${id}`))
      .set(who.auth)
      .send(body);

  it('records a response with its working days since the registration', async () => {
    const res = await add();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      applicationId,
      outgoingNumber: '125/01-15',
      responseDate: '2026-11-06',
      engineer: { id: engineerId, fullName: 'Бойко Андрій' },
      documentsReceivedAt: null,
      workingDays: 4, // 03–06.11; the registration day is not counted
      scan: null,
      previousScans: [],
      cancellation: null,
      createdBy: { id: owner.user.id },
      version: 1,
    });
    expect(await AuditLog.findOne({ action: 'RESPONSE_CREATED' }).lean()).toMatchObject({
      entityType: 'ApplicationResponse',
      details: {
        applicationId,
        regNumber: '1т/26-8',
        outgoingNumber: '125/01-15',
        responseDate: '2026-11-06',
      },
    });
  });

  it('keeps several responses in date order; a colleague of the department may add one', async () => {
    await add({ outgoingNumber: 'друга', responseDate: '2026-11-12' });
    await add({ outgoingNumber: 'перша', responseDate: '2026-11-04' }, colleague);

    const rows = (await list()).body as { outgoingNumber: string; workingDays: number }[];
    expect(rows.map((row) => [row.outgoingNumber, row.workingDays])).toEqual([
      ['перша', 2],
      ['друга', 8],
    ]);
  });

  it('dates a response between the registration and today', async () => {
    const early = await add({ responseDate: '2026-11-01' });
    expect(early.body.error.details.fieldErrors.responseDate).toEqual([
      'Дата відповіді не може бути раніше дати реєстрації заяви (02.11.2026)',
    ]);
    const future = await add({ responseDate: '2026-11-21' });
    expect(future.body.error.details.fieldErrors.responseDate).toEqual([
      'Дата відповіді не може бути в майбутньому',
    ]);
    expect((await add({ responseDate: '2026-11-02' })).body.workingDays).toBe(0);
  });

  it("takes an active engineer of the application's department only", async () => {
    const reni = await Engineer.create({
      fullName: 'Ренійський Інженер',
      department: 'RENI',
      createdBy: admin.user._id,
    });
    const retired = await Engineer.create({
      fullName: 'Колишній Інженер',
      department: 'ODESA',
      isActive: false,
      createdBy: admin.user._id,
    });

    expect(
      (await add({ engineer: String(reni._id) })).body.error.details.fieldErrors.engineer,
    ).toEqual(['Оберіть інженера управління заяви']);
    expect(
      (await add({ engineer: String(retired._id) })).body.error.details.fieldErrors.engineer,
    ).toEqual(['Інженера деактивовано: оберіть іншого']);
    expect((await add({ engineer: '0123456789abcdef01234567' })).status).toBe(400);
  });

  it('keeps the name and the choice of an engineer deactivated or renamed later', async () => {
    const { body: response } = await add();
    await request(app)
      .patch(`/api/v1/engineers/${engineerId}`)
      .set(admin.auth)
      .send({ fullName: 'Бойко Андрій Петрович', isActive: false });

    expect((await list()).body[0].engineer).toEqual({ id: engineerId, fullName: 'Бойко Андрій' });
    // Editing another field does not force a new engineer.
    const edited = await patch(response.id, {
      version: 1,
      outgoingNumber: '125/01-16',
      engineer: engineerId,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.engineer.fullName).toBe('Бойко Андрій');
  });

  it('edits with the version seen and audits what changed', async () => {
    const { body: response } = await add();
    const other = await Engineer.create({
      fullName: 'Ткач Ярослав',
      department: 'ODESA',
      createdBy: admin.user._id,
    });

    const edited = await patch(response.id, {
      version: 1,
      responseDate: '2026-11-05',
      engineer: String(other._id),
    });
    expect(edited.body).toMatchObject({
      responseDate: '2026-11-05',
      engineer: { fullName: 'Ткач Ярослав' },
      workingDays: 3,
      version: 2,
    });
    expect((await patch(response.id, { version: 1, outgoingNumber: 'x' })).status).toBe(409);
    expect(await AuditLog.findOne({ action: 'RESPONSE_UPDATED' }).lean()).toMatchObject({
      details: {
        changes: [
          { field: 'responseDate', from: '2026-11-06', to: '2026-11-05' },
          { field: 'engineer', from: 'Бойко Андрій', to: 'Ткач Ярослав' },
        ],
      },
    });
    // Nothing changed: same version back, no audit entry.
    expect(
      (await patch(response.id, { version: 2, outgoingNumber: '125/01-15' })).body.version,
    ).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'RESPONSE_UPDATED' })).toBe(1);
  });

  it('records when the documents came, not before the response nor in the future; clears it', async () => {
    const { body: response } = await add();

    const before = await patch(response.id, { version: 1, documentsReceivedAt: '2026-11-05' });
    expect(before.body.error.details.fieldErrors.documentsReceivedAt).toEqual([
      'Документи не можуть надійти раніше дати відповіді',
    ]);
    const future = await patch(response.id, { version: 1, documentsReceivedAt: '2026-11-21' });
    expect(future.status).toBe(400);

    const received = await patch(response.id, { version: 1, documentsReceivedAt: '2026-11-10' });
    expect(received.body.documentsReceivedAt).toBe('2026-11-10');
    // Moving the response after the documents is refused against the response date.
    const moved = await patch(response.id, { version: 2, responseDate: '2026-11-12' });
    expect(moved.body.error.details.fieldErrors.responseDate).toBeDefined();

    const cleared = await patch(response.id, { version: 2, documentsReceivedAt: null });
    expect(cleared.body.documentsReceivedAt).toBeNull();
    expect(
      (await ApplicationResponse.findById(response.id).lean())!.documentsReceivedAt,
    ).toBeUndefined();
  });

  it('cancels with a reason instead of deleting; only an admin restores', async () => {
    const { body: response } = await add();
    const cancel = (body: Record<string, unknown>, who = owner) =>
      request(app)
        .post(url(`/${response.id}/cancel`))
        .set(who.auth)
        .send(body);
    const restore = (who: ApiSession, version: number) =>
      request(app)
        .post(url(`/${response.id}/restore`))
        .set(who.auth)
        .send({ version });

    expect((await cancel({ version: 1, reason: '' })).status).toBe(400);
    const cancelled = await cancel({ version: 1, reason: 'Внесено помилково' });
    expect(cancelled.body.cancellation).toMatchObject({
      reason: 'Внесено помилково',
      by: { id: owner.user.id },
    });
    expect((await list()).body).toHaveLength(1);
    expect((await patch(response.id, { version: 2, outgoingNumber: 'x' })).body.error.code).toBe(
      'DOCUMENT_CANCELLED',
    );
    expect((await cancel({ version: 2, reason: 'Ще раз' })).status).toBe(409);

    expect((await restore(owner, 2)).status).toBe(403);
    const restored = await restore(admin, 2);
    expect(restored.body).toMatchObject({ cancellation: null, version: 3 });

    const actions = (
      await AuditLog.find({ entityType: 'ApplicationResponse' }).sort({ createdAt: 1 }).lean()
    ).map((entry) => entry.action);
    expect(actions).toEqual(['RESPONSE_CREATED', 'RESPONSE_CANCELLED', 'RESPONSE_RESTORED']);
    // The free-text reason stays out of the journal.
    expect(
      JSON.stringify(await AuditLog.find({ action: 'RESPONSE_CANCELLED' }).lean()),
    ).not.toContain('помилково');
  });

  it('hides another department’s application entirely and freezes an annulled one', async () => {
    const { body: response } = await add();

    expect((await list(elsewhere)).status).toBe(404);
    expect((await add({}, elsewhere)).status).toBe(404);
    expect((await patch(response.id, { version: 1, outgoingNumber: 'x' }, elsewhere)).status).toBe(
      404,
    );
    expect((await list(admin)).body).toHaveLength(1);

    await request(app)
      .post(`${APPLICATIONS}/${applicationId}/annul`)
      .set(owner.auth)
      .send({ reason: 'Замовник відкликав', version: 1 });
    expect((await add()).body.error.code).toBe('APPLICATION_ANNULLED');
    expect((await patch(response.id, { version: 1, outgoingNumber: 'x' })).status).toBe(409);
    expect((await list()).body).toHaveLength(1);
  });

  it('is deleted with its application', async () => {
    await add();
    const version = (await request(app).get(`${APPLICATIONS}/${applicationId}`).set(admin.auth))
      .body.version as number;

    const res = await request(app)
      .delete(`${APPLICATIONS}/${applicationId}`)
      .query({ version })
      .set(admin.auth);
    expect(res.status).toBe(204);
    expect(await ApplicationResponse.countDocuments()).toBe(0);
  });

  it('refuses another application’s response through this one', async () => {
    const { body: response } = await add();
    const otherApplication = (await registerApplication(app, owner)).id;

    const res = await request(app)
      .patch(`${APPLICATIONS}/${otherApplication}/responses/${response.id}`)
      .set(owner.auth)
      .send({ version: 1, outgoingNumber: 'x' });
    expect(res.status).toBe(404);
  });
});
