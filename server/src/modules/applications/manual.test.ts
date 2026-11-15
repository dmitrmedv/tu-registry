import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { signedInUser } from '../../test/auth';
import { useTestDb } from '../../test/db';
import { clock } from '../../utils/clock';
import { AuditLog } from '../audit/auditLog.model';
import { Counter } from '../numbering/counter.model';
import { Application } from './application.model';
import { ApplicationChange } from './applicationChange.model';

const app = createApp();
const MANUAL = '/api/v1/applications/manual';
const AUTO = '/api/v1/applications';

const fields = {
  customer: 'ТОВ «Архів»',
  customerRepresentative: 'Коваль Олена',
  phone: '0441234567',
  objectAddress: 'м. Київ, вул. Архівна, 5',
  objectType: 'DOMESTIC',
};
const backdated = { ...fields, regDate: '2025-06-10', regSeq: '15' };

async function as(options: Parameters<typeof signedInUser>[1]) {
  const session = await signedInUser(app, options);
  return { ...session, auth: { Authorization: `Bearer ${session.accessToken}` } };
}

describe('manual (back-dated) registration', () => {
  useTestDb();

  beforeEach(() => {
    // "Today" in Kyiv is 12 March 2026.
    vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-03-12T09:00:00Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('access', () => {
    it('is forbidden for regular users and audited', async () => {
      const { auth, user } = await as({});

      const res = await request(app).post(MANUAL).set(auth).send(backdated);

      expect(res.status).toBe(403);
      expect(await Application.countDocuments()).toBe(0);
      const audit = await AuditLog.findOne({ action: 'ACCESS_DENIED', actor: user._id });
      expect(audit?.details).toMatchObject({ required: 'canManageRegistration' });
    });

    it.each([
      ['an authorized user', { canManageRegistration: true }],
      ['an administrator', { role: 'ADMIN' as const }],
    ])('is allowed for %s', async (_who, options) => {
      const { auth } = await as(options);

      expect((await request(app).post(MANUAL).set(auth).send(backdated)).status).toBe(201);
    });
  });

  it('stores the given date and number, who entered it and when it was actually entered', async () => {
    const { auth, user } = await as({ canManageRegistration: true });

    const res = await request(app)
      .post(MANUAL)
      .set(auth)
      .send({ ...backdated, regSeq: ' 0015 ' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      regNumber: '15т/25',
      regYear: 2025,
      regSeq: 15,
      regDate: '2025-06-10',
      registrationMode: 'MANUAL',
      createdBy: { id: user.id },
    });
    expect(res.body.createdAt.startsWith('2026-')).toBe(true);
    expect(await ApplicationChange.countDocuments({ action: 'CREATED' })).toBe(1);
    const audit = await AuditLog.findOne({ action: 'APPLICATION_MANUAL_CREATED' });
    expect(audit?.details).toEqual({ regNumber: '15т/25', regDate: '2025-06-10' });
  });

  it('takes the year from the registration date: the same digits differ by year', async () => {
    const { auth } = await as({ canManageRegistration: true });

    const in2024 = await request(app)
      .post(MANUAL)
      .set(auth)
      .send({ ...fields, regDate: '2024-12-31', regSeq: '14' });
    const in2025 = await request(app)
      .post(MANUAL)
      .set(auth)
      .send({ ...fields, regDate: '2025-01-02', regSeq: '14' });

    expect([in2024.status, in2025.status]).toEqual([201, 201]);
    expect([in2024.body.regNumber, in2025.body.regNumber]).toEqual(['14т/24', '14т/25']);
  });

  describe('number check before saving', () => {
    const CHECK = `${MANUAL}/check`;

    it("reports a free number and a taken one with the holder's date", async () => {
      const { auth } = await as({ canManageRegistration: true });
      await request(app).post(MANUAL).set(auth).send(backdated);

      const taken = await request(app)
        .get(CHECK)
        .query({ regDate: '2025-01-05', regSeq: '15' })
        .set(auth);
      const free = await request(app)
        .get(CHECK)
        .query({ regDate: '2024-01-05', regSeq: '15' })
        .set(auth);

      expect(taken.body).toEqual({ regNumber: '15т/25', available: false, takenOn: '2025-06-10' });
      expect(free.body).toEqual({ regNumber: '15т/24', available: true, takenOn: null });
    });

    it('validates the query and is limited to authorized users', async () => {
      const authorized = await as({ canManageRegistration: true });
      const regular = await as({});

      expect(
        (
          await request(app)
            .get(CHECK)
            .query({ regDate: '2025-13-01', regSeq: '1' })
            .set(authorized.auth)
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .get(CHECK)
            .query({ regDate: '2025-01-01', regSeq: '1' })
            .set(regular.auth)
        ).status,
      ).toBe(403);
    });
  });

  it('never touches the automatic counter, not even for another year', async () => {
    const { auth } = await as({ canManageRegistration: true });

    await request(app).post(MANUAL).set(auth).send(backdated);

    expect(await Counter.countDocuments()).toBe(0);
  });

  it('lets the automatic sequence skip a number entered ahead of it', async () => {
    const { auth } = await as({ canManageRegistration: true });
    await request(app).post(AUTO).set(auth).send(fields);
    await request(app).post(AUTO).set(auth).send(fields);

    const ahead = await request(app)
      .post(MANUAL)
      .set(auth)
      .send({ ...fields, regDate: '2026-03-01', regSeq: 5 });
    const autoNumbers = [];
    for (let i = 0; i < 3; i++) {
      autoNumbers.push((await request(app).post(AUTO).set(auth).send(fields)).body.regNumber);
    }

    expect(ahead.status).toBe(201);
    expect(autoNumbers).toEqual(['3т/26', '4т/26', '6т/26']);
    expect((await Counter.findById(2026))?.lastSeq).toBe(6);
  });

  it.each([
    ['an automatic', AUTO, fields],
    ['a manual', MANUAL, { ...fields, regDate: '2026-02-01', regSeq: '1' }],
  ])('rejects a number already taken by %s registration', async (_kind, url, body) => {
    const { auth } = await as({ canManageRegistration: true });
    await request(app).post(url).set(auth).send(body);

    const res = await request(app)
      .post(MANUAL)
      .set(auth)
      .send({ ...fields, regDate: '2026-01-15', regSeq: '1' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'REG_NUMBER_TAKEN',
      details: { field: 'regNumber' },
    });
    expect(res.body.error.message).toMatch(
      /^Номер 1т\/26 уже зайнятий \(заява від \d{2}\.\d{2}\.2026\)$/,
    );
  });

  it('lets exactly one of two simultaneous requests take the same number', async () => {
    const { auth } = await as({ canManageRegistration: true });

    const results = await Promise.all(
      Array.from({ length: 2 }, () => request(app).post(MANUAL).set(auth).send(backdated)),
    );

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Application.countDocuments({ regYear: 2025, regSeq: 15 })).toBe(1);
  });

  it.each([
    ['a full number instead of digits', { regSeq: '15т/25' }, 'regSeq'],
    ['a zero number', { regSeq: '0' }, 'regSeq'],
    ['a missing number', { regSeq: undefined }, 'regSeq'],
    ['a date in the future (server time)', { regDate: '2026-03-13', regSeq: '1' }, 'regDate'],
    ['an impossible date', { regDate: '2025-02-30' }, 'regDate'],
    ['a missing date', { regDate: undefined }, 'regDate'],
  ])('rejects %s', async (_case, override, field) => {
    const { auth } = await as({ canManageRegistration: true });

    const res = await request(app)
      .post(MANUAL)
      .set(auth)
      .send({ ...backdated, ...override });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors).toHaveProperty(field);
    expect(await Application.countDocuments()).toBe(0);
  });

  it('accepts today as a registration date', async () => {
    const { auth } = await as({ canManageRegistration: true });

    const res = await request(app)
      .post(MANUAL)
      .set(auth)
      .send({ ...fields, regDate: '2026-03-12', regSeq: '100' });

    expect(res.status).toBe(201);
  });

  it('rejects fields the client must not control', async () => {
    const { auth } = await as({ canManageRegistration: true });

    const res = await request(app)
      .post(MANUAL)
      .set(auth)
      .send({ ...backdated, registrationMode: 'AUTO' });

    expect(res.status).toBe(400);
  });
});
