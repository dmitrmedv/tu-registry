import { existsSync } from 'node:fs';
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
import { scanPath } from '../scans/scan.storage';
import { TechnicalConditions } from './technicalConditions.model';

const app = createApp();
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);

describe('technical conditions of an application', () => {
  useTestDb();

  let now: MockInstance<() => Date>;
  let owner: ApiSession;
  let elsewhere: ApiSession;
  let admin: ApiSession;
  let applicationId: string;
  let engineerId: string;

  beforeEach(async () => {
    // Registered on Monday 02.11.2026.
    now = vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-02T09:00:00Z'));
    owner = await signedInWithAuth(app, { login: 'owner' });
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

  const url = (path = '') => `${APPLICATIONS}/${applicationId}/technical-conditions${path}`;
  const fields = {
    tuNumber: '0032/ТУ',
    preparedDate: '2026-11-16',
    gasFlow: '2,5',
    connectionType: 'STANDARD',
    gasPressure: 'LOW',
    connectionPoint: 'UNDERGROUND',
  };
  const add = (body: Record<string, unknown> = {}, who = owner) =>
    request(app)
      .post(url())
      .set(who.auth)
      .send({ ...fields, engineer: engineerId, ...body });
  const list = (who = owner) => request(app).get(url()).set(who.auth);
  const patch = (id: string, body: Record<string, unknown>, who = owner) =>
    request(app)
      .patch(url(`/${id}`))
      .set(who.auth)
      .send(body);
  const cancel = (id: string, version: number) =>
    request(app)
      .post(url(`/${id}/cancel`))
      .set(owner.auth)
      .send({ version, reason: 'Помилка' });

  it('records technical conditions without any response, with working days of 10', async () => {
    const res = await add();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      applicationId,
      tuNumber: '0032/ТУ',
      preparedDate: '2026-11-16',
      engineer: { id: engineerId, fullName: 'Бойко Андрій' },
      gasFlow: 2.5,
      connectionType: 'STANDARD',
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
      workingDays: 10, // 03.11–16.11: the last day of the term
      scan: null,
      cancellation: null,
      version: 1,
    });
    expect(await AuditLog.findOne({ action: 'TU_CREATED' }).lean()).toMatchObject({
      entityType: 'TechnicalConditions',
      details: { regNumber: '1т/26-8', tuNumber: '0032/ТУ', preparedDate: '2026-11-16' },
    });
    const journal = await request(app).get('/api/v1/audit').set(admin.auth);
    expect(journal.body.data[0].entityLabel).toBe('0032/ТУ до заяви 1т/26-8');
  });

  it('follows a response whose documents came, without closing anything', async () => {
    const response = await request(app)
      .post(`${APPLICATIONS}/${applicationId}/responses`)
      .set(owner.auth)
      .send({ outgoingNumber: '125', responseDate: '2026-11-06', engineer: engineerId });
    await request(app)
      .patch(`${APPLICATIONS}/${applicationId}/responses/${response.body.id}`)
      .set(owner.auth)
      .send({ version: 1, documentsReceivedAt: '2026-11-10' });

    const res = await add({ preparedDate: '2026-11-17' });
    expect(res.body.workingDays).toBe(11);
    expect(
      (await request(app).get(`${APPLICATIONS}/${applicationId}/responses`).set(owner.auth)).body,
    ).toHaveLength(1);
  });

  it('keeps one valid set per application: another only after cancelling', async () => {
    const { body: first } = await add();

    const second = await add({ tuNumber: '0033/ТУ' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DOCUMENT_TAKEN');

    await cancel(first.id, 1);
    const replacement = await add({ tuNumber: '0033/ТУ' });
    expect(replacement.status).toBe(201);

    // Restoring the first while the replacement is valid would make two.
    const restore = await request(app)
      .post(url(`/${first.id}/restore`))
      .set(admin.auth)
      .send({ version: 2 });
    expect(restore.status).toBe(409);
    expect(restore.body.error.message).toBe(
      'У заяви вже є інші чинні технічні умови: спершу скасуйте їх.',
    );

    await cancel(replacement.body.id, 1);
    const restored = await request(app)
      .post(url(`/${first.id}/restore`))
      .set(admin.auth)
      .send({ version: 2 });
    expect(restored.body).toMatchObject({ cancellation: null, version: 3 });
    expect((await list()).body.map((tu: { tuNumber: string }) => tu.tuNumber)).toEqual([
      '0032/ТУ',
      '0033/ТУ',
    ]);
  });

  it('checks the date, the engineer and the gas flow', async () => {
    expect((await add({ preparedDate: '2026-11-01' })).body.error.details.fieldErrors).toEqual({
      preparedDate: ['Дата підготовки ТУ не може бути раніше дати реєстрації заяви (02.11.2026)'],
    });
    expect((await add({ preparedDate: '2026-11-21' })).status).toBe(400);
    expect((await add({ gasFlow: '0,0001' })).status).toBe(400);
    expect((await add({ gasFlow: 0 })).status).toBe(400);
    expect((await add({ connectionPoint: 'AIR' })).status).toBe(400);

    const reni = await Engineer.create({
      fullName: 'Ренійський Інженер',
      department: 'RENI',
      createdBy: admin.user._id,
    });
    expect((await add({ engineer: String(reni._id) })).body.error.details.fieldErrors).toEqual({
      engineer: ['Оберіть інженера управління заяви'],
    });
    expect(await TechnicalConditions.countDocuments()).toBe(0);
  });

  it('edits with the version seen, keeps a deactivated engineer, audits what changed', async () => {
    const { body: tu } = await add();
    await request(app)
      .patch(`/api/v1/engineers/${engineerId}`)
      .set(admin.auth)
      .send({ isActive: false });

    const edited = await patch(tu.id, {
      version: 1,
      gasFlow: 3,
      gasPressure: 'MEDIUM',
      engineer: engineerId,
    });
    expect(edited.body).toMatchObject({
      gasFlow: 3,
      gasPressure: 'MEDIUM',
      engineer: { fullName: 'Бойко Андрій' },
      version: 2,
    });
    expect((await patch(tu.id, { version: 1, gasFlow: 4 })).status).toBe(409);
    expect(await AuditLog.findOne({ action: 'TU_UPDATED' }).lean()).toMatchObject({
      details: {
        changes: [
          { field: 'gasFlow', from: 2.5, to: 3 },
          { field: 'gasPressure', from: 'LOW', to: 'MEDIUM' },
        ],
      },
    });
  });

  it('hides another department’s application, freezes an annulled one and cancelled sets', async () => {
    const { body: tu } = await add();

    expect((await list(elsewhere)).status).toBe(404);
    expect((await add({}, elsewhere)).status).toBe(404);
    await cancel(tu.id, 1);
    expect((await patch(tu.id, { version: 2, gasFlow: 4 })).body.error.code).toBe(
      'DOCUMENT_CANCELLED',
    );
    expect(
      (
        await request(app)
          .post(url(`/${tu.id}/restore`))
          .set(owner.auth)
          .send({ version: 2 })
      ).status,
    ).toBe(403);

    await request(app)
      .post(`${APPLICATIONS}/${applicationId}/annul`)
      .set(owner.auth)
      .send({ reason: 'Замовник відкликав', version: 1 });
    expect((await add()).body.error.code).toBe('APPLICATION_ANNULLED');
    expect((await list()).body).toHaveLength(1);
  });

  it('keeps a replaced scan and removes every file with the application', async () => {
    const { body: tu } = await add();
    const upload = (text: string) =>
      request(app)
        .put(url(`/${tu.id}/scan`))
        .set(owner.auth)
        .attach('scan', pdf(text), { filename: `${text}.pdf`, contentType: 'application/pdf' });
    await upload('перші');
    const { body } = await upload('другі');

    expect(body.scan.name).toBe('другі.pdf');
    expect(body.previousScans.map((scan: { name: string }) => scan.name)).toEqual(['перші.pdf']);
    const earlier = await request(app)
      .get(url(`/${tu.id}/scan`))
      .query({ file: body.previousScans[0].id })
      .set(admin.auth);
    expect(earlier.status).toBe(200);
    expect(
      (
        await request(app)
          .get(url(`/${tu.id}/scan`))
          .set(elsewhere.auth)
      ).status,
    ).toBe(404);

    const stored = await TechnicalConditions.findById(tu.id).lean();
    const files = [stored!.scan!.fileId, body.previousScans[0].id as string];
    const version = (await request(app).get(`${APPLICATIONS}/${applicationId}`).set(admin.auth))
      .body.version as number;
    await request(app)
      .delete(`${APPLICATIONS}/${applicationId}`)
      .query({ version })
      .set(admin.auth);
    expect(await TechnicalConditions.countDocuments()).toBe(0);
    expect(files.map((file) => existsSync(scanPath(file)))).toEqual([false, false]);
  });
});
