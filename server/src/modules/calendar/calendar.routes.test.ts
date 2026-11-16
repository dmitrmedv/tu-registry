import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { type ApiSession, signedInWithAuth } from '../../test/applications';
import { useTestDb } from '../../test/db';
import { clock } from '../../utils/clock';
import { AuditLog } from '../audit/auditLog.model';
import { documentDeadline } from './calendar.service';

const app = createApp();
const CALENDAR = '/api/v1/calendar';

describe('working-day calendar API', () => {
  useTestDb();

  let admin: ApiSession;
  let user: ApiSession;

  beforeEach(async () => {
    admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
    user = await signedInWithAuth(app, { login: 'olena' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const add = (body: Record<string, unknown>, who = admin) =>
    request(app).post(CALENDAR).set(who.auth).send(body);
  const patch = (date: string, body: Record<string, unknown>) =>
    request(app).patch(`${CALENDAR}/${date}`).set(admin.auth).send(body);
  const remove = (date: string) => request(app).delete(`${CALENDAR}/${date}`).set(admin.auth);
  const year = async (value: number) =>
    (await request(app).get(CALENDAR).query({ year: value }).set(admin.auth)).body as {
      date: string;
    }[];

  it('adds a day off and a working Saturday, lists them by year with who changed them', async () => {
    const holiday = await add({
      date: '2026-11-04',
      kind: 'NON_WORKING',
      description: 'Додатковий вихідний',
    });
    expect(holiday.status).toBe(201);
    expect(holiday.body).toEqual({
      date: '2026-11-04',
      kind: 'NON_WORKING',
      description: 'Додатковий вихідний',
      updatedBy: { id: admin.user.id, fullName: admin.user.fullName },
      updatedAt: expect.any(String),
    });
    await add({ date: '2026-11-07', kind: 'WORKING', description: 'Відпрацювання' });
    await add({ date: '2027-01-08', kind: 'NON_WORKING', description: 'Наступний рік' });

    expect((await year(2026)).map((day) => day.date)).toEqual(['2026-11-04', '2026-11-07']);
    expect((await year(2027)).map((day) => day.date)).toEqual(['2027-01-08']);
  });

  it('refuses an exception that changes nothing, and a date twice', async () => {
    const weekend = await add({ date: '2026-11-08', kind: 'NON_WORKING', description: 'Неділя' });
    expect(weekend.status).toBe(400);
    expect(weekend.body.error.details.fieldErrors.kind).toEqual([
      'Субота й неділя — вихідні й так',
    ]);

    await add({ date: '2026-11-04', kind: 'NON_WORKING', description: 'Вихідний' });
    const twice = await add({ date: '2026-11-04', kind: 'NON_WORKING', description: 'Ще раз' });
    expect(twice.status).toBe(409);
    expect(twice.body.error.details.fieldErrors.date).toEqual(['Ця дата вже є в календарі']);
  });

  it('edits the description and the type (where it still makes sense), and deletes', async () => {
    await add({ date: '2026-11-04', kind: 'NON_WORKING', description: 'Вихідний' });

    const edited = await patch('2026-11-04', { description: 'День памʼяті' });
    expect(edited.body).toMatchObject({ kind: 'NON_WORKING', description: 'День памʼяті' });
    const wrongKind = await patch('2026-11-04', { kind: 'WORKING' });
    expect(wrongKind.body.error.details.fieldErrors.kind).toEqual(['Будній день — робочий і так']);
    expect((await patch('2026-11-04', { date: '2026-11-05' })).status).toBe(400);

    expect((await remove('2026-11-04')).status).toBe(204);
    expect(await year(2026)).toEqual([]);
    expect((await remove('2026-11-04')).status).toBe(404);
    expect((await patch('2026-11-04', { description: 'Немає' })).status).toBe(404);
  });

  it('keeps every change in the audit log', async () => {
    await add({ date: '2026-11-04', kind: 'NON_WORKING', description: 'Вихідний' });
    await patch('2026-11-04', { description: 'День памʼяті' });
    await patch('2026-11-04', { description: 'День памʼяті' }); // nothing changed
    await remove('2026-11-04');

    const entries = await AuditLog.find({ entityType: 'CalendarDay' })
      .sort({ createdAt: 1 })
      .lean();
    expect(entries.map((entry) => [entry.action, entry.entityId])).toEqual([
      ['CALENDAR_DAY_CREATED', '2026-11-04'],
      ['CALENDAR_DAY_UPDATED', '2026-11-04'],
      ['CALENDAR_DAY_DELETED', '2026-11-04'],
    ]);
    expect(entries[1]!.details).toEqual({
      date: '2026-11-04',
      changes: [{ field: 'description', from: 'Вихідний', to: 'День памʼяті' }],
    });
    const journal = await request(app).get('/api/v1/audit').set(admin.auth);
    expect(journal.body.data[0]).toMatchObject({
      action: 'CALENDAR_DAY_DELETED',
      entityLabel: '2026-11-04',
    });
  });

  it('is for admins only', async () => {
    expect((await request(app).get(CALENDAR).query({ year: 2026 }).set(user.auth)).status).toBe(
      403,
    );
    expect(
      (await add({ date: '2026-11-04', kind: 'NON_WORKING', description: 'Вихідний' }, user))
        .status,
    ).toBe(403);
  });

  it('feeds deadlines: a change of the calendar changes them at once', async () => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-05T10:00:00Z'));
    // Registered Mon 02.11; today Thu 05.11 in Kyiv.
    expect(await documentDeadline('2026-11-02', null, 5)).toEqual({
      norm: 5,
      used: 3,
      remaining: 2,
      dueDate: '2026-11-09',
      overdueBy: 0,
      done: false,
    });

    await add({ date: '2026-11-04', kind: 'NON_WORKING', description: 'Вихідний' });
    await add({ date: '2026-11-07', kind: 'WORKING', description: 'Відпрацювання' });
    expect(await documentDeadline('2026-11-02', null, 5)).toMatchObject({
      used: 2,
      dueDate: '2026-11-09', // −1 for Wednesday, +1 for the working Saturday
    });
    expect(await documentDeadline('2026-11-02', '2026-11-09', 5)).toMatchObject({
      used: 5,
      overdueBy: 0,
      done: true,
    });
  });
});
