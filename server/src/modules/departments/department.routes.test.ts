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
import { Department } from './department.model';
import { ensureInitialDepartments } from './department.service';

const app = createApp();
const DEPARTMENTS = '/api/v1/departments';

describe('departments API', () => {
  useTestDb();

  let admin: ApiSession;
  let reni: ApiSession;

  beforeEach(async () => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-03-12T09:00:00Z'));
    admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
    reni = await signedInWithAuth(app, { login: 'reni', department: 'RENI' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const create = (body: Record<string, unknown>, who = admin) =>
    request(app).post(DEPARTMENTS).set(who.auth).send(body);
  const patch = (id: string, body: Record<string, unknown>) =>
    request(app).patch(`${DEPARTMENTS}/${id}`).set(admin.auth).send(body);
  const action = (id: string, verb: 'archive' | 'restore') =>
    request(app).post(`${DEPARTMENTS}/${id}/${verb}`).set(admin.auth);
  const remove = (id: string) => request(app).delete(`${DEPARTMENTS}/${id}`).set(admin.auth);
  const createUser = (department: string) =>
    request(app)
      .post('/api/v1/users')
      .set(admin.auth)
      .send({ login: `u${Date.now()}`, fullName: 'Новий Працівник', department });

  describe('listing', () => {
    it('gives everyone names and codes by code; admins also the counts', async () => {
      const forUser = (await request(app).get(DEPARTMENTS).set(reni.auth)).body;
      expect(forUser).toHaveLength(14);
      expect(forUser[7]).toEqual({ id: 'ODESA', name: 'Одеське', code: 8, archived: false });

      await registerApplication(app, reni);
      const forAdmin = (await request(app).get(DEPARTMENTS).set(admin.auth)).body as {
        id: string;
        usersCount: number;
        applicationsCount: number;
      }[];
      expect(forAdmin.find((d) => d.id === 'RENI')).toMatchObject({
        usersCount: 1,
        applicationsCount: 1,
      });
      expect(forAdmin.find((d) => d.id === 'ODESA')).toMatchObject({ usersCount: 1 }); // admin
    });
  });

  describe('creating and editing', () => {
    it('lets an admin add a department that can be used right away', async () => {
      const res = await create({ name: ' Тестове ', code: '20' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Тестове', code: 20, archived: false });
      expect(await AuditLog.exists({ action: 'DEPARTMENT_CREATED' })).toBeTruthy();

      const user = await createUser(res.body.id);
      expect(user.status).toBe(201);
      const created = await registerApplication(app, admin, {
        ...applicationFields,
        department: res.body.id,
      });
      expect(created.regNumber).toBe('1т/26-20');
    });

    it('is for admins only', async () => {
      expect((await create({ name: 'Тестове', code: 20 }, reni)).status).toBe(403);
      expect(
        (await request(app).patch(`${DEPARTMENTS}/RENI`).set(reni.auth).send({ code: 99 })).status,
      ).toBe(403);
    });

    it('keeps names (case-insensitively) and codes unique', async () => {
      const sameName = await create({ name: 'одеське', code: 20 });
      expect(sameName.status).toBe(409);
      expect(sameName.body.error.details.fieldErrors.name).toEqual([
        'Управління з такою назвою вже є',
      ]);

      const sameCode = await create({ name: 'Тестове', code: 8 });
      expect(sameCode.status).toBe(409);
      expect(sameCode.body.error.details.fieldErrors.code).toEqual([
        'Цей код уже має інше управління',
      ]);

      expect((await patch('RENI', { code: 8 })).status).toBe(409);
      expect((await create({ name: 'Т', code: 0 })).status).toBe(400);
    });

    it('re-codes: the numbers of its applications show the new code at once', async () => {
      const created = await registerApplication(app, reni);
      expect(created.regNumber).toBe('1т/26-11');

      const res = await patch('RENI', { code: 111 });

      expect(res.body).toMatchObject({ id: 'RENI', code: 111 });
      const card = await request(app).get(`${APPLICATIONS}/${created.id}`).set(reni.auth);
      expect(card.body.regNumber).toBe('1т/26-111');
      const found = await request(app)
        .get(APPLICATIONS)
        .query({ number: '1т/26-111' })
        .set(admin.auth);
      expect(found.body.meta.total).toBe(1);
      const audit = await AuditLog.findOne({ action: 'DEPARTMENT_UPDATED' }).lean();
      expect(audit?.details).toMatchObject({ changes: [{ field: 'code', from: 11, to: 111 }] });
    });

    it('answers 404 for an unknown department', async () => {
      expect((await patch('NOPE', { code: 99 })).status).toBe(404);
      expect((await action('NOPE', 'archive')).status).toBe(404);
    });
  });

  describe('archiving', () => {
    it('stops anything new going in, keeps what is there, and can be undone', async () => {
      const existing = await registerApplication(app, reni);
      expect((await action('RENI', 'archive')).body.archived).toBe(true);

      // Nothing new: users, registrations (by anyone), moves.
      const newUser = await createUser('RENI');
      expect(newUser.status).toBe(400);
      expect(newUser.body.error.details.fieldErrors.department).toEqual(['Управління в архіві']);
      expect(
        (await request(app).post(APPLICATIONS).set(reni.auth).send(applicationFields)).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post(APPLICATIONS)
            .set(admin.auth)
            .send({ ...applicationFields, department: 'RENI' })
        ).status,
      ).toBe(400);
      const odesaApp = await registerApplication(app, admin);
      const move = await request(app)
        .patch(`${APPLICATIONS}/${odesaApp.id}`)
        .set(admin.auth)
        .send({ department: 'RENI', version: 1 });
      expect(move.status).toBe(400);

      // What is there stays: the user still works with the department's applications.
      const card = await request(app).get(`${APPLICATIONS}/${existing.id}`).set(reni.auth);
      expect(card.status).toBe(200);
      const edit = await request(app)
        .patch(`${APPLICATIONS}/${existing.id}`)
        .set(reni.auth)
        .send({ comment: 'Ще працюємо', version: 1 });
      expect(edit.status).toBe(200);

      expect((await action('RENI', 'restore')).body.archived).toBe(false);
      expect((await registerApplication(app, reni)).regNumber).toBe('2т/26-11');
      expect(await AuditLog.countDocuments({ action: /DEPARTMENT_(ARCHIVED|RESTORED)/ })).toBe(2);
    });
  });

  describe('deleting', () => {
    it('deletes an empty department for good, with its counters', async () => {
      const { body } = await create({ name: 'Тимчасове', code: 30 });
      await Counter.create({ _id: counterId(2026, body.id), lastSeq: 0 });

      expect((await remove(body.id)).status).toBe(204);
      expect(await Department.exists({ _id: body.id })).toBeNull();
      expect(await Counter.exists({ _id: counterId(2026, body.id) })).toBeNull();
      expect(await AuditLog.exists({ action: 'DEPARTMENT_DELETED' })).toBeTruthy();
    });

    it('refuses to delete a department with users or applications', async () => {
      const res = await remove('RENI');

      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: 'DEPARTMENT_IN_USE',
        details: { users: 1, applications: 0 },
      });
      expect(await Department.exists({ _id: 'RENI' })).not.toBeNull();
    });
  });

  it('sorts the registry by the current department names', async () => {
    await registerApplication(app, admin); // Одеське
    await registerApplication(app, reni); // Ренійське
    const order = async () =>
      (
        (await request(app).get(APPLICATIONS).query({ sort: 'department' }).set(admin.auth)).body
          .data as { department: string }[]
      ).map((row) => row.department);

    expect(await order()).toEqual(['ODESA', 'RENI']);
    await patch('RENI', { name: 'Ананьївське друге' }); // А… comes before О…
    expect(await order()).toEqual(['RENI', 'ODESA']);
  });

  it('names the department in the audit journal', async () => {
    await patch('RENI', { name: 'Ренійське оновлене' });

    const journal = await request(app)
      .get('/api/v1/audit')
      .query({ action: 'DEPARTMENT_UPDATED' })
      .set(admin.auth);

    expect(journal.body.data[0]).toMatchObject({
      entityType: 'Department',
      entityId: 'RENI',
      entityLabel: 'Ренійське оновлене',
    });
  });

  it('adds the initial departments once and never overwrites edited ones', async () => {
    await patch('RENI', { name: 'Ренійське оновлене', code: 111 });

    expect(await ensureInitialDepartments()).toBe(0);
    expect(await Department.findById('RENI').lean()).toMatchObject({
      name: 'Ренійське оновлене',
      code: 111,
    });
    await Department.deleteOne({ _id: 'IZMAIL' });
    expect(await ensureInitialDepartments()).toBe(1);
  });
});
