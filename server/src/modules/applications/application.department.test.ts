import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import {
  APPLICATIONS,
  type ApiSession,
  applicationFields,
  registerApplication,
  signedInWithAuth,
} from '../../test/applications';
import { useTestDb } from '../../test/db';
import { clock } from '../../utils/clock';
import { AuditLog } from '../audit/auditLog.model';
import { Counter, counterId } from '../numbering/counter.model';
import { User } from '../users/user.model';
import {
  assignDefaultDepartment,
  dropYearWideUniqueNumberIndex,
  moveCountersToDefaultDepartment,
} from './application.migration';
import { Application } from './application.model';

const app = createApp();

describe('departments', () => {
  useTestDb();

  let odesa: ApiSession;
  let odesaColleague: ApiSession;
  let reni: ApiSession;
  let admin: ApiSession;

  beforeEach(async () => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-03-12T09:00:00Z'));
    odesa = await signedInWithAuth(app, { login: 'odesa', canManageRegistration: true });
    odesaColleague = await signedInWithAuth(app, { login: 'odesa2' });
    reni = await signedInWithAuth(app, {
      login: 'reni',
      department: 'RENI',
      canManageRegistration: true,
    });
    admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const list = (who: ApiSession, query: Record<string, string> = {}) =>
    request(app).get(APPLICATIONS).query(query).set(who.auth);
  const numbers = async (who: ApiSession, query: Record<string, string> = {}) =>
    ((await list(who, query)).body.data as { regNumber: string }[]).map((row) => row.regNumber);

  describe('numbering', () => {
    it('numbers each department separately and puts its code into the number', async () => {
      const first = await registerApplication(app, odesa);
      const reniFirst = await registerApplication(app, reni);
      const second = await registerApplication(app, odesaColleague);

      expect([first.regNumber, reniFirst.regNumber, second.regNumber]).toEqual([
        '1т/26-8',
        '1т/26-11',
        '2т/26-8',
      ]);
      expect(reniFirst).toMatchObject({ department: 'RENI' });
      expect((await Counter.findById(counterId(2026, 'RENI')))?.lastSeq).toBe(1);
      const hint = await request(app).get(`${APPLICATIONS}/next-number`).set(reni.auth);
      expect(hint.body.regNumber).toBe('2т/26-11');
    });

    it('allows the same manual number in two departments, but not twice in one', async () => {
      const manual = { ...applicationFields, regDate: '2025-05-20', regSeq: '5' };
      const post = (who: ApiSession) =>
        request(app).post(`${APPLICATIONS}/manual`).set(who.auth).send(manual);

      expect((await post(odesa)).body.regNumber).toBe('5т/25-8');
      expect((await post(reni)).body.regNumber).toBe('5т/25-11');
      expect((await post(odesa)).status).toBe(409);
    });

    it('checks a manual number in the own department; an admin may name another one', async () => {
      await registerApplication(app, reni);
      const check = (who: ApiSession, department?: string) =>
        request(app)
          .get(`${APPLICATIONS}/manual/check`)
          .query({ regDate: '2026-03-01', regSeq: 1, ...(department && { department }) })
          .set(who.auth);

      expect((await check(odesa, 'RENI')).body).toMatchObject({
        regNumber: '1т/26-8',
        available: true,
      });
      expect((await check(admin, 'RENI')).body).toMatchObject({
        regNumber: '1т/26-11',
        available: false,
      });
    });
  });

  describe('registering into a department', () => {
    it('lets an admin choose the department, with its own counter and next-number hint', async () => {
      const hint = await request(app)
        .get(`${APPLICATIONS}/next-number`)
        .query({ department: 'RENI' })
        .set(admin.auth);
      expect(hint.body.regNumber).toBe('1т/26-11');

      const created = await registerApplication(app, admin, {
        ...applicationFields,
        department: 'RENI',
      });
      expect(created).toMatchObject({ department: 'RENI', regNumber: '1т/26-11' });
      // Ренійське users see it; it is not Одеське's.
      expect(await numbers(reni)).toEqual(['1т/26-11']);
      expect(await numbers(odesa)).toEqual([]);

      const manual = await request(app)
        .post(`${APPLICATIONS}/manual`)
        .set(admin.auth)
        .send({ ...applicationFields, department: 'RENI', regDate: '2025-05-20', regSeq: '3' });
      expect(manual.body.regNumber).toBe('3т/25-11');
    });

    it("registers an admin's application into their own department when none is chosen", async () => {
      expect((await registerApplication(app, admin)).regNumber).toBe('1т/26-8');
    });

    it('refuses (and audits) a user registering into another department', async () => {
      const res = await request(app)
        .post(APPLICATIONS)
        .set(odesa.auth)
        .send({ ...applicationFields, department: 'RENI' });

      expect(res.status).toBe(403);
      expect(await Application.countDocuments()).toBe(0);
      expect(
        await AuditLog.exists({ action: 'ACCESS_DENIED', actor: odesa.user._id }),
      ).toBeTruthy();
      // Naming their own department is fine; the hint ignores another one.
      expect(
        (await registerApplication(app, odesa, { ...applicationFields, department: 'ODESA' }))
          .regNumber,
      ).toBe('1т/26-8');
      const hint = await request(app)
        .get(`${APPLICATIONS}/next-number`)
        .query({ department: 'RENI' })
        .set(odesa.auth);
      expect(hint.body.regNumber).toBe('2т/26-8');
    });
  });

  describe('visibility', () => {
    beforeEach(async () => {
      await registerApplication(app, odesa);
      await registerApplication(app, reni);
    });

    it('shows a user only their department, whatever the query asks for', async () => {
      expect(await numbers(odesa)).toEqual(['1т/26-8']);
      expect(await numbers(odesa, { department: 'RENI' })).toEqual(['1т/26-8']);
      expect(await numbers(odesa, { q: '1т/26-11' })).toEqual([]);
      expect(await numbers(odesa, { q: '1' })).toEqual(['1т/26-8']);
      expect(await numbers(reni)).toEqual(['1т/26-11']);
    });

    it('shows an admin every department and filters by one on request', async () => {
      expect((await numbers(admin, { sort: 'regNumber' })).sort()).toEqual(['1т/26-11', '1т/26-8']);
      expect(await numbers(admin, { department: 'RENI' })).toEqual(['1т/26-11']);
      expect(await numbers(admin, { q: '1т/26-8' })).toEqual(['1т/26-8']);
      expect(await numbers(admin, { q: '1т/26-11' })).toEqual(['1т/26-11']);
      expect(await numbers(admin, { q: '1т/26-11', department: 'ODESA' })).toEqual([]);
      expect(await numbers(admin, { q: '1т/26' })).toHaveLength(2);
    });

    it('sorts departments by name for an admin', async () => {
      // Одеське < Ренійське
      expect(await numbers(admin, { sort: 'department' })).toEqual(['1т/26-8', '1т/26-11']);
      expect(await numbers(admin, { sort: '-department' })).toEqual(['1т/26-11', '1т/26-8']);
    });

    it('offers a user only colleagues of their department in the author filter', async () => {
      const names = async (who: ApiSession) =>
        ((await request(app).get('/api/v1/users/options').set(who.auth)).body as { id: string }[])
          .map((option) => option.id)
          .sort();

      expect(await names(odesa)).toEqual(
        [odesa.user.id, odesaColleague.user.id, admin.user.id].sort(),
      );
      expect(await names(admin)).toHaveLength(4);
    });
  });

  describe('moving an application to another department', () => {
    it('is for admins: the number takes the new code and must be free there', async () => {
      const created = await registerApplication(app, odesa);
      const patch = (who: ApiSession, body: Record<string, unknown>) =>
        request(app).patch(`${APPLICATIONS}/${created.id}`).set(who.auth).send(body);

      expect((await patch(odesa, { department: 'RENI', version: 1 })).status).toBe(403);
      expect(
        await AuditLog.exists({ action: 'ACCESS_DENIED', actor: odesa.user._id }),
      ).toBeTruthy();

      await registerApplication(app, reni); // takes 1т/26-11
      const taken = await patch(admin, { department: 'RENI', version: 1 });
      expect(taken.status).toBe(409);
      expect(taken.body.error.code).toBe('REG_NUMBER_TAKEN');

      const moved = await patch(admin, { department: 'RENI', regSeq: '2', version: 1 });
      expect(moved.body).toMatchObject({ department: 'RENI', regNumber: '2т/26-11' });
      expect(await AuditLog.findOne({ action: 'REG_NUMBER_CHANGED' }).lean()).toMatchObject({
        details: { from: '1т/26-8', to: '2т/26-11' },
      });
      // Now it belongs to Ренійське: its former department no longer sees it.
      expect((await request(app).get(`${APPLICATIONS}/${created.id}`).set(odesa.auth)).status).toBe(
        404,
      );
    });
  });

  it('keeps a user in their department when an admin moves them; applications stay', async () => {
    const created = await registerApplication(app, odesaColleague);
    await request(app)
      .patch(`/api/v1/users/${odesaColleague.user.id}`)
      .set(admin.auth)
      .send({ department: 'RENI' });

    expect((await Application.findById(created.id))?.department).toBe('ODESA');
    // Rights are read from the database on every request: the move applies at once.
    expect(await numbers(odesaColleague)).toEqual([]);
  });

  describe('migration of data from before departments', () => {
    it('assigns Одеське to users and applications without a department, once', async () => {
      await User.collection.updateOne({ _id: odesa.user._id }, { $unset: { department: '' } });
      const created = await registerApplication(app, reni);
      await Application.collection.updateOne(
        { _id: new Types.ObjectId(created.id) },
        { $unset: { department: '' } },
      );

      expect(await assignDefaultDepartment()).toEqual({ users: 1, applications: 1 });
      expect(await assignDefaultDepartment()).toEqual({ users: 0, applications: 0 });
      expect((await User.findById(odesa.user._id))?.department).toBe('ODESA');
      expect((await Application.findById(created.id))?.department).toBe('ODESA');
    });

    it('continues the year counters as Одеське without a gap', async () => {
      await Counter.collection.insertOne({ _id: 2026, lastSeq: 14 } as never);

      expect(await moveCountersToDefaultDepartment()).toBe(1);
      expect(await moveCountersToDefaultDepartment()).toBe(0);
      expect((await registerApplication(app, odesa)).regNumber).toBe('15т/26-8');
    });

    it('drops the year-wide unique index, so departments can share a number', async () => {
      await Application.collection.createIndex(
        { regYear: 1, regSeq: 1 },
        { unique: true, name: 'regYear_1_regSeq_1' },
      );
      await registerApplication(app, odesa);
      // While the old index exists, the same number in another department is a duplicate.
      expect(
        (await request(app).post(APPLICATIONS).set(reni.auth).send(applicationFields)).status,
      ).toBe(409);

      expect(await dropYearWideUniqueNumberIndex()).toBe(true);
      expect(await dropYearWideUniqueNumberIndex()).toBe(false);
      expect((await registerApplication(app, reni)).regNumber).toBe('1т/26-11');
    });
  });
});
