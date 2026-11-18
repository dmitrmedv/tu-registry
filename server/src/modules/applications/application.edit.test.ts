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
import { Application } from './application.model';
import { ApplicationChange } from './applicationChange.model';

const app = createApp();
const BASE = APPLICATIONS;
const fields = applicationFields;

type Session = ApiSession;
const as = (options: Parameters<typeof signedInWithAuth>[1] = {}) => signedInWithAuth(app, options);
const register = (who: Session, body: Record<string, unknown> = fields) =>
  registerApplication(app, who, body);

const get = (who: Session, id: string) => request(app).get(`${BASE}/${id}`).set(who.auth);
const patch = (who: Session, id: string, body: Record<string, unknown>) =>
  request(app).patch(`${BASE}/${id}`).set(who.auth).send(body);
const annul = (who: Session, id: string, body: Record<string, unknown>) =>
  request(app).post(`${BASE}/${id}/annul`).set(who.auth).send(body);
const restore = (who: Session, id: string, version: number) =>
  request(app).post(`${BASE}/${id}/restore`).set(who.auth).send({ version });
const history = (who: Session, id: string) =>
  request(app).get(`${BASE}/${id}/history`).set(who.auth);

describe('application card, editing, annulment and history', () => {
  useTestDb();

  let owner: Session;
  let authorizedOwner: Session;
  let other: Session;
  let elsewhere: Session;
  let admin: Session;

  beforeEach(async () => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-03-12T09:00:00Z'));
    owner = await as({ login: 'owner' });
    authorizedOwner = await as({ login: 'authorized', canManageRegistration: true });
    other = await as({ login: 'other' });
    elsewhere = await as({ login: 'elsewhere', department: 'RENI', canManageRegistration: true });
    admin = await as({ login: 'boss', role: 'ADMIN' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /:id', () => {
    it('shows the full card to any signed-in user', async () => {
      const created = await register(owner);

      const res = await get(other, created.id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        regNumber: '1т/26-8',
        phone: '+380671234567',
        email: 'office@example.ua',
        createdBy: { id: owner.user.id, fullName: owner.user.fullName },
        annulment: null,
        version: 1,
      });
    });

    it('answers 404, 400 and 401 where appropriate', async () => {
      expect((await get(owner, '0123456789abcdef01234567')).status).toBe(404);
      expect((await get(owner, 'nope')).status).toBe(400);
      expect((await request(app).get(`${BASE}/0123456789abcdef01234567`)).status).toBe(401);
    });
  });

  describe('editing content', () => {
    it('lets the owner change fields, clear optional ones, and records exact old → new values', async () => {
      const created = await register(owner);

      const res = await patch(owner, created.id, {
        customer: 'ТОВ «Нова назва»',
        customerRepresentative: '',
        email: '',
        objectType: 'DOMESTIC', // unchanged: not recorded
        version: 1,
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        customer: 'ТОВ «Нова назва»',
        customerRepresentative: null,
        email: null,
        version: 2,
        regNumber: '1т/26-8',
      });
      const change = await ApplicationChange.findOne({ action: 'UPDATED' }).lean();
      expect(change?.changes).toEqual([
        { field: 'customer', oldValue: 'ТОВ «Приклад»', newValue: 'ТОВ «Нова назва»' },
        { field: 'customerRepresentative', oldValue: 'Петренко Іван', newValue: null },
        { field: 'email', oldValue: 'office@example.ua', newValue: null },
      ]);
      // Content edits live in the history, not in the security journal.
      expect(await AuditLog.countDocuments({ action: /REG_/ })).toBe(0);
    });

    it('keeps a personal account / contract number for a reconstruction only', async () => {
      const created = await register(owner);

      // New gasification has no account: one sent with it is dropped.
      const ignored = await patch(owner, created.id, { accountNumber: '0412345678', version: 1 });
      expect(ignored.body).toMatchObject({ gasificationType: 'NEW', accountNumber: null });
      const set = await patch(owner, created.id, {
        gasificationType: 'RECONSTRUCTION',
        accountNumber: ' 0412345678 ',
        version: 1,
      });
      expect(set.body).toMatchObject({
        gasificationType: 'RECONSTRUCTION',
        accountNumber: '0412345678',
      });
      const tooLong = await patch(owner, created.id, { accountNumber: '1'.repeat(51), version: 2 });
      expect(tooLong.status).toBe(400);
      // Back to new gasification: the account goes with it.
      const back = await patch(owner, created.id, { gasificationType: 'NEW', version: 2 });
      expect(back.body.accountNumber).toBeNull();
      const changes = await ApplicationChange.find({ action: 'UPDATED' }).sort({ _id: 1 }).lean();
      expect(changes.map((change) => change.changes)).toEqual([
        [
          { field: 'gasificationType', oldValue: 'NEW', newValue: 'RECONSTRUCTION' },
          { field: 'accountNumber', oldValue: null, newValue: '0412345678' },
        ],
        [
          { field: 'gasificationType', oldValue: 'RECONSTRUCTION', newValue: 'NEW' },
          { field: 'accountNumber', oldValue: '0412345678', newValue: null },
        ],
      ]);
    });

    it('does nothing (no new version, no history) when nothing actually changed', async () => {
      const created = await register(owner);

      const res = await patch(owner, created.id, { customer: fields.customer, version: 1 });

      expect(res.body.version).toBe(1);
      expect(await ApplicationChange.countDocuments({ action: 'UPDATED' })).toBe(0);
    });

    it('lets a colleague of the same department edit the application (stage 13)', async () => {
      const created = await register(owner);

      const res = await patch(other, created.id, { customer: 'Виправлено колегою', version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.customer).toBe('Виправлено колегою');
    });

    it("hides another department's application: not found, nothing changes", async () => {
      const created = await register(owner);

      expect((await get(elsewhere, created.id)).status).toBe(404);
      expect((await history(elsewhere, created.id)).status).toBe(404);
      const res = await patch(elsewhere, created.id, { customer: 'Чуже', version: 1 });
      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe('Заяву не знайдено');
      expect((await annul(elsewhere, created.id, { reason: 'Чуже', version: 1 })).status).toBe(404);
      expect((await Application.findById(created.id))?.customer).toBe(fields.customer);
    });

    it('lets an administrator edit any application', async () => {
      const created = await register(owner);

      expect((await patch(admin, created.id, { phone: '0501112233', version: 1 })).body.phone).toBe(
        '+380501112233',
      );
    });

    it('rejects a stale version so nobody silently overwrites a colleague', async () => {
      const created = await register(owner);
      await patch(owner, created.id, { customer: 'Перша правка', version: 1 });

      const stale = await patch(admin, created.id, { customer: 'Друга правка', version: 1 });

      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('VERSION_CONFLICT');
      expect((await Application.findById(created.id))?.customer).toBe('Перша правка');
    });

    it('lets exactly one of two simultaneous edits of the same version win', async () => {
      const created = await register(owner);

      const results = await Promise.all([
        patch(owner, created.id, { customer: 'A', version: 1 }),
        patch(admin, created.id, { customer: 'B', version: 1 }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await Application.findById(created.id))?.version).toBe(2);
    });

    it.each([
      [{ phone: '123', version: 1 }],
      [{ regYear: 2020, version: 1 }],
      [{ createdBy: 'x', version: 1 }],
      [{ version: 1 }],
      [{ customer: 'Без версії' }],
    ])('rejects invalid input %j', async (body) => {
      const created = await register(owner);

      expect((await patch(owner, created.id, body)).status).toBe(400);
    });
  });

  describe('changing registration date and number', () => {
    it('is not allowed to owners without the "authorized" flag', async () => {
      const created = await register(owner);

      const res = await patch(owner, created.id, { regSeq: '50', version: 1 });

      expect(res.status).toBe(403);
      expect(
        await AuditLog.exists({ action: 'ACCESS_DENIED', actor: owner.user._id }),
      ).toBeTruthy();
    });

    it("is allowed to authorized users on colleagues' applications of the department", async () => {
      const created = await register(owner);

      const res = await patch(authorizedOwner, created.id, { regSeq: '50', version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.regNumber).toBe('50т/26-8');
    });

    it('changes the number, audits it, and never touches the automatic counter', async () => {
      const created = await register(authorizedOwner);

      const res = await patch(authorizedOwner, created.id, { regSeq: '50', version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.regNumber).toBe('50т/26-8');
      expect((await Counter.findById(counterId(2026, 'ODESA')))?.lastSeq).toBe(1);
      const audit = await AuditLog.findOne({ action: 'REG_NUMBER_CHANGED' });
      expect(audit?.details).toEqual({ from: '1т/26-8', to: '50т/26-8' });
      // The freed number is not handed out again by the automatic sequence.
      expect((await register(authorizedOwner)).regNumber).toBe('2т/26-8');
    });

    it('moves the number to the year of a new date', async () => {
      const created = await register(authorizedOwner);

      const res = await patch(authorizedOwner, created.id, { regDate: '2025-12-30', version: 1 });

      expect(res.body).toMatchObject({ regDate: '2025-12-30', regNumber: '1т/25-8' });
      expect(await AuditLog.exists({ action: 'REG_DATE_CHANGED' })).toBeTruthy();
      expect(await AuditLog.exists({ action: 'REG_NUMBER_CHANGED' })).toBeTruthy();
      const change = await ApplicationChange.findOne({ action: 'UPDATED' }).lean();
      expect(change?.changes).toEqual([
        { field: 'regDate', oldValue: '2026-03-12', newValue: '2025-12-30' },
        { field: 'regNumber', oldValue: '1т/26-8', newValue: '1т/25-8' },
      ]);
    });

    it('rejects a number that is already taken and a future date', async () => {
      const first = await register(authorizedOwner);
      await register(authorizedOwner); // 2т/26-8

      const taken = await patch(authorizedOwner, first.id, { regSeq: '2', version: 1 });
      const future = await patch(authorizedOwner, first.id, { regDate: '2026-03-13', version: 1 });

      expect(taken.status).toBe(409);
      expect(taken.body.error.code).toBe('REG_NUMBER_TAKEN');
      expect(future.status).toBe(400);
    });

    it('rolls back the change, history and version if the audit cannot be written', async () => {
      const created = await register(authorizedOwner);
      vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('audit down'));

      const res = await patch(authorizedOwner, created.id, { regSeq: '50', version: 1 });

      expect(res.status).toBe(500);
      const stored = await Application.findById(created.id);
      expect([stored?.regSeq, stored?.version]).toEqual([1, 1]);
      expect(await ApplicationChange.countDocuments({ action: 'UPDATED' })).toBe(0);
    });
  });

  describe('annulment and restoring', () => {
    it('annuls with a reason; the number stays taken and the record cannot be edited', async () => {
      const created = await register(authorizedOwner);

      const res = await annul(authorizedOwner, created.id, {
        reason: 'Подано помилково',
        version: 1,
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ANNULLED',
        version: 2,
        annulment: { reason: 'Подано помилково', by: { id: authorizedOwner.user.id } },
      });
      expect(await AuditLog.exists({ action: 'APPLICATION_ANNULLED' })).toBeTruthy();

      const edit = await patch(authorizedOwner, created.id, { customer: 'Інше', version: 2 });
      expect(edit.status).toBe(409);
      expect(edit.body.error.code).toBe('APPLICATION_ANNULLED');

      const sameNumber = await request(app)
        .post(`${BASE}/manual`)
        .set(authorizedOwner.auth)
        .send({ ...fields, regDate: '2026-03-01', regSeq: '1' });
      expect(sameNumber.status).toBe(409);
    });

    it('checks reason, state and version; a colleague of the department may annul', async () => {
      const created = await register(owner);
      const colleagues = await register(other);

      expect((await annul(owner, colleagues.id, { reason: 'Дубль', version: 1 })).status).toBe(200);
      expect((await annul(owner, created.id, { reason: 'x', version: 1 })).status).toBe(400);
      expect((await annul(owner, created.id, { reason: 'Причина', version: 9 })).status).toBe(409);
      await annul(owner, created.id, { reason: 'Причина', version: 1 });
      const again = await annul(owner, created.id, { reason: 'Ще раз', version: 2 });
      expect(again.body.error.code).toBe('ALREADY_ANNULLED');
    });

    it('restores only for administrators', async () => {
      const created = await register(owner);
      await annul(owner, created.id, { reason: 'Помилка', version: 1 });

      expect((await restore(owner, created.id, 2)).status).toBe(403);
      const res = await restore(admin, created.id, 2);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ACTIVE', annulment: null, version: 3 });
      expect(await AuditLog.exists({ action: 'APPLICATION_RESTORED' })).toBeTruthy();
      expect((await restore(admin, created.id, 3)).body.error.code).toBe('NOT_ANNULLED');
    });
  });

  it('returns the history newest first with author names', async () => {
    const created = await register(owner);
    await patch(owner, created.id, { customer: 'Нова назва', version: 1 });
    await annul(admin, created.id, { reason: 'Дубль', version: 2 });

    const res = await history(other, created.id);

    expect(res.status).toBe(200);
    expect(res.body.map((entry: { action: string }) => entry.action)).toEqual([
      'ANNULLED',
      'UPDATED',
      'CREATED',
    ]);
    expect(res.body[0].changedBy.fullName).toBe(admin.user.fullName);
    expect(res.body[0].changes).toContainEqual({
      field: 'annulmentReason',
      oldValue: null,
      newValue: 'Дубль',
    });
    expect((await history(owner, '0123456789abcdef01234567')).status).toBe(404);
  });

  it('filters the registry by «Стан»: annulled, or the stage of an active one', async () => {
    const created = await register(owner);
    await register(owner);
    await annul(owner, created.id, { reason: 'Помилка', version: 1 });

    const total = async (query: Record<string, string>) =>
      (await request(app).get(BASE).query(query).set(owner.auth)).body.meta.total as number;

    expect(await total({ stage: 'ANNULLED' })).toBe(1);
    // An annulled application is not «registered» any more, whatever its documents.
    expect(await total({ stage: 'REGISTERED' })).toBe(1);
    expect(await total({})).toBe(2);
  });

  it('does not report the edited application as holding its own number', async () => {
    const created = await register(authorizedOwner);

    const res = await request(app)
      .get(`${BASE}/manual/check`)
      .query({ regDate: '2026-03-12', regSeq: '1', excludeId: created.id })
      .set(authorizedOwner.auth);

    expect(res.body).toMatchObject({ regNumber: '1т/26-8', available: true });
  });
});
