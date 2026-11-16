import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { createApp } from '../../app';
import { env } from '../../config/env';
import {
  APPLICATIONS,
  type ApiSession,
  registerApplication,
  signedInWithAuth,
} from '../../test/applications';
import { useTestDb } from '../../test/db';
import { clock } from '../../utils/clock';
import { Application } from '../applications/application.model';
import { backfillProcessing } from '../applications/application.migration';
import { CalendarDay } from '../calendar/calendarDay.model';
import { Engineer } from '../engineers/engineer.model';
import { ApplicationResponse } from '../responses/response.model';

const app = createApp();

describe('processing of an application: stage, deadlines, timeline', () => {
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
    // Thursday 05.11.2026.
    now.mockReturnValue(new Date('2026-11-05T09:00:00Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    env.PROCESSING_START_DATE = undefined;
  });

  const base = `${APPLICATIONS}/:id`;
  const at = (path: string) => base.replace(':id', applicationId) + path;
  const processing = (who = owner) => request(app).get(at('/processing')).set(who.auth);
  const stage = async () => (await request(app).get(at('')).set(owner.auth)).body.stage as string;
  const respond = async (body: Record<string, unknown> = {}) =>
    (
      await request(app)
        .post(at('/responses'))
        .set(owner.auth)
        .send({
          outgoingNumber: '125/01-15',
          responseDate: '2026-11-04',
          engineer: engineerId,
          ...body,
        })
    ).body as { id: string; version: number };
  const documentsCame = (response: { id: string }, date: string, version = 1) =>
    request(app)
      .patch(at(`/responses/${response.id}`))
      .set(owner.auth)
      .send({ version, documentsReceivedAt: date });
  const prepareTu = async (body: Record<string, unknown> = {}) =>
    (
      await request(app)
        .post(at('/technical-conditions'))
        .set(owner.auth)
        .send({
          tuNumber: '0032/ТУ',
          preparedDate: '2026-11-12',
          engineer: engineerId,
          gasFlow: 2.5,
          connectionType: 'STANDARD',
          gasPressure: 'LOW',
          connectionPoint: 'UNDERGROUND',
          ...body,
        })
    ).body as { id: string; version: number };
  const cancel = (kind: 'responses' | 'technical-conditions', id: string, version: number) =>
    request(app)
      .post(at(`/${kind}/${id}/cancel`))
      .set(owner.auth)
      .send({ version, reason: 'Помилка' });

  it('moves through the stages as documents come, and back when they are cancelled', async () => {
    expect(await stage()).toBe('REGISTERED');

    const first = await respond();
    expect(await stage()).toBe('RESPONDED');
    await documentsCame(first, '2026-11-05');
    expect(await stage()).toBe('IN_PROGRESS');
    // Another response after the documents: answered again, waiting again.
    const second = await respond({ outgoingNumber: '130/01-15', responseDate: '2026-11-05' });
    expect(await stage()).toBe('RESPONDED');

    now.mockReturnValue(new Date('2026-11-13T09:00:00Z'));
    const tu = await prepareTu();
    expect(await stage()).toBe('TU_PREPARED');

    await cancel('technical-conditions', tu.id, 1);
    expect(await stage()).toBe('RESPONDED');
    await cancel('responses', second.id, 1);
    expect(await stage()).toBe('IN_PROGRESS');
    expect((await processing()).body.stage).toBe('IN_PROGRESS');
  });

  it('keeps a summary of the documents in force for the registry', async () => {
    const first = await respond();
    await documentsCame(first, '2026-11-05');
    now.mockReturnValue(new Date('2026-11-13T09:00:00Z'));
    await prepareTu();

    const stored = await Application.findById(applicationId).lean();
    expect(stored!.processing).toMatchObject({
      stage: 'TU_PREPARED',
      lastResponseDate: new Date('2026-11-04T00:00:00Z'),
      lastResponseNumber: '125/01-15',
      tuDate: new Date('2026-11-12T00:00:00Z'),
      tuNumber: '0032/ТУ',
      gasFlow: 2.5,
      connectionType: 'STANDARD',
      engineerName: 'Бойко Андрій',
      documentNumbers: ['125/01-15', '0032/ТУ'],
    });
    expect(stored!.processing!.engineerIds.map(String)).toEqual([engineerId]);
    // The summary never conflicts with an edit of the application's fields.
    expect(stored!.version).toBe(1);
  });

  it('changes a document and the summary together, or neither', async () => {
    vi.spyOn(Application, 'updateOne').mockRejectedValueOnce(new Error('write failed'));

    const res = await request(app)
      .post(at('/responses'))
      .set(owner.auth)
      .send({ outgoingNumber: '125/01-15', responseDate: '2026-11-04', engineer: engineerId });

    expect(res.status).toBe(500);
    expect(await ApplicationResponse.countDocuments()).toBe(0);
    expect(await stage()).toBe('REGISTERED');
  });

  it('reports deadlines: a response given in time, technical conditions still awaited', async () => {
    await respond();

    expect((await processing()).body.deadlines).toEqual({
      tracked: true,
      response: {
        norm: 5,
        used: 2,
        remaining: 3,
        dueDate: '2026-11-09',
        overdueBy: 0,
        done: true,
      },
      // Awaited: counted to today, Thursday 05.11.
      tu: { norm: 10, used: 3, remaining: 7, dueDate: '2026-11-16', overdueBy: 0, done: false },
    });
  });

  it('counts by the calendar and shows what is overdue', async () => {
    await CalendarDay.create({
      _id: '2026-11-03',
      kind: 'NON_WORKING',
      description: 'Вихідний',
      createdBy: admin.user._id,
      updatedBy: admin.user._id,
    });
    now.mockReturnValue(new Date('2026-11-20T09:00:00Z'));

    const { deadlines } = (await processing()).body;
    expect(deadlines.response).toMatchObject({ used: 13, overdueBy: 8, done: false });
    expect(deadlines.tu).toMatchObject({ used: 13, dueDate: '2026-11-17', overdueBy: 3 });
  });

  it('needs no response once technical conditions came without one', async () => {
    await prepareTu({ preparedDate: '2026-11-05' });
    const { deadlines } = (await processing()).body;
    expect(deadlines.response).toBeNull();
    expect(deadlines.tu).toMatchObject({ used: 3, done: true });
  });

  it('works for a back-dated application, and tracks none before PROCESSING_START_DATE', async () => {
    const manual = await request(app).post(`${APPLICATIONS}/manual`).set(admin.auth).send({
      customer: 'ТОВ «Старе»',
      phone: '+380671234567',
      settlement: 'м. Київ',
      areaType: 'URBAN',
      objectAddress: 'вул. Стара, 1',
      objectType: 'DOMESTIC',
      objectCategory: 'APARTMENT',
      regDate: '2025-03-03',
      regSeq: '7',
    });
    const old = (path: string) =>
      request(app).get(`${APPLICATIONS}/${manual.body.id}${path}`).set(admin.auth);

    const tracked = (await old('/processing')).body.deadlines;
    expect(tracked).toMatchObject({ tracked: true, response: { dueDate: '2025-03-10' } });
    expect(tracked.response.overdueBy).toBeGreaterThan(400);

    env.PROCESSING_START_DATE = '2026-01-01';
    expect((await old('/processing')).body.deadlines.tracked).toBe(false);
    expect((await old('')).body.deadlinesTracked).toBe(false);
    expect((await processing()).body.deadlines.tracked).toBe(true);
  });

  it('lays out the timeline in the order things happened, cancelled ones in place', async () => {
    const first = await respond({ responseDate: '2026-11-04' });
    await documentsCame(first, '2026-11-05');
    const wrong = await respond({ outgoingNumber: 'помилкова', responseDate: '2026-11-05' });
    await cancel('responses', wrong.id, 1);
    now.mockReturnValue(new Date('2026-11-13T09:00:00Z'));
    await prepareTu({ preparedDate: '2026-11-12' });

    const { events } = (await processing()).body as {
      events: {
        type: string;
        date: string;
        number: string | null;
        person: string | null;
        workingDays: number;
        norm: number | null;
        sinceDocumentsReceived: number | null;
        cancelled: boolean;
      }[];
    };
    expect(events.map((e) => [e.type, e.date, e.number, e.workingDays, e.cancelled])).toEqual([
      ['REGISTERED', '2026-11-02', '1т/26-8', 0, false],
      ['RESPONSE', '2026-11-04', '125/01-15', 2, false],
      // Same day: the response that was given comes before the documents that came.
      ['RESPONSE', '2026-11-05', 'помилкова', 3, true],
      ['DOCUMENTS_RECEIVED', '2026-11-05', null, 3, false],
      ['TECHNICAL_CONDITIONS', '2026-11-12', '0032/ТУ', 8, false],
    ]);
    expect(events[0]!.person).toBe(owner.user.fullName);
    expect(events[1]).toMatchObject({ person: 'Бойко Андрій', norm: 5 });
    // 06, 09, 10, 11 and 12.11: working days after the documents came on Thursday 05.11.
    expect(events[4]).toMatchObject({ norm: 10, sinceDocumentsReceived: 5 });
  });

  it('is hidden from another department', async () => {
    expect((await processing(elsewhere)).status).toBe(404);
    expect((await processing(admin)).status).toBe(200);
  });

  it('is filled in for applications from before, once', async () => {
    const response = await respond();
    await Application.updateMany({}, { $unset: { processing: 1 } });

    expect(await backfillProcessing()).toBe(1);
    expect(await backfillProcessing()).toBe(0);
    expect(await stage()).toBe('RESPONDED');
    expect(response.id).toBeDefined();
  });
});
