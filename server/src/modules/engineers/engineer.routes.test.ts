import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { type ApiSession, signedInWithAuth } from '../../test/applications';
import { useTestDb } from '../../test/db';
import { AuditLog } from '../audit/auditLog.model';
import { Department } from '../departments/department.model';
import { Engineer } from './engineer.model';

const app = createApp();
const ENGINEERS = '/api/v1/engineers';

describe('engineers API', () => {
  useTestDb();

  let admin: ApiSession;
  let odesa: ApiSession;

  beforeEach(async () => {
    admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
    odesa = await signedInWithAuth(app, { login: 'odesa' });
  });

  const create = (body: Record<string, unknown>, who = admin) =>
    request(app).post(ENGINEERS).set(who.auth).send(body);
  const patch = (id: string, body: Record<string, unknown>, who = admin) =>
    request(app).patch(`${ENGINEERS}/${id}`).set(who.auth).send(body);
  const names = async (who: ApiSession, query: Record<string, string> = {}) =>
    (
      (await request(app).get(ENGINEERS).query(query).set(who.auth)).body as { fullName: string }[]
    ).map((engineer) => engineer.fullName);

  it('lets an admin add engineers to a department and audits it', async () => {
    const res = await create({ fullName: ' Бойко Андрій ', department: 'RENI' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      fullName: 'Бойко Андрій',
      department: 'RENI',
      isActive: true,
    });
    expect(await AuditLog.findOne({ action: 'ENGINEER_CREATED' }).lean()).toMatchObject({
      actor: admin.user._id,
      details: { fullName: 'Бойко Андрій', department: 'RENI' },
    });
    const journal = await request(app).get('/api/v1/audit').set(admin.auth);
    expect(journal.body.data[0]).toMatchObject({
      action: 'ENGINEER_CREATED',
      entityType: 'Engineer',
      entityLabel: 'Бойко Андрій',
    });
  });

  it('allows one name once per department, but the same name in another department', async () => {
    await create({ fullName: 'Бойко Андрій', department: 'RENI' });

    const twice = await create({ fullName: 'бойко андрій', department: 'RENI' });
    expect(twice.status).toBe(409);
    expect(twice.body.error.details.fieldErrors.fullName).toEqual([
      'Інженер з таким ПІБ в управлінні вже є',
    ]);
    expect((await create({ fullName: 'Бойко Андрій', department: 'ODESA' })).status).toBe(201);
  });

  it('refuses a missing or archived department', async () => {
    expect((await create({ fullName: 'Бойко Андрій', department: 'NOPE' })).status).toBe(400);
    await Department.updateOne({ _id: 'RENI' }, { archived: true });
    const archived = await create({ fullName: 'Бойко Андрій', department: 'RENI' });
    expect(archived.body.error.details.fieldErrors.department).toEqual(['Управління в архіві']);
  });

  it('is managed by admins only', async () => {
    expect((await create({ fullName: 'Бойко Андрій', department: 'ODESA' }, odesa)).status).toBe(
      403,
    );
    const created = await create({ fullName: 'Бойко Андрій', department: 'ODESA' });
    expect((await patch(created.body.id, { isActive: false }, odesa)).status).toBe(403);
  });

  it('renames and deactivates, but never moves to another department', async () => {
    const { body: engineer } = await create({ fullName: 'Бойко Андрій', department: 'ODESA' });

    const moved = await patch(engineer.id, { department: 'RENI' });
    expect(moved.status).toBe(400);

    const renamed = await patch(engineer.id, { fullName: 'Бойко Андрій Петрович' });
    expect(renamed.body).toMatchObject({ fullName: 'Бойко Андрій Петрович', department: 'ODESA' });

    const deactivated = await patch(engineer.id, { isActive: false });
    expect(deactivated.body.isActive).toBe(false);
    expect(await Engineer.countDocuments()).toBe(1);
    expect(
      (await AuditLog.find({ entityType: 'Engineer' }).sort({ createdAt: 1 }).lean()).map(
        (entry) => entry.action,
      ),
    ).toEqual(['ENGINEER_CREATED', 'ENGINEER_UPDATED', 'ENGINEER_DEACTIVATED']);

    // Nothing changed: no audit entry.
    await patch(engineer.id, { isActive: false });
    expect(await AuditLog.countDocuments({ entityType: 'Engineer' })).toBe(3);
    expect((await patch('0123456789abcdef01234567', { isActive: true })).status).toBe(404);
  });

  it("shows a user their department's engineers only; an admin any, by department and status", async () => {
    await create({ fullName: 'Ткач Ярослав', department: 'ODESA' });
    const { body: retired } = await create({ fullName: 'Андрієнко Ольга', department: 'ODESA' });
    await patch(retired.id, { isActive: false });
    await create({ fullName: 'Бойко Андрій', department: 'RENI' });

    expect(await names(odesa)).toEqual(['Андрієнко Ольга', 'Ткач Ярослав']);
    expect(await names(odesa, { department: 'RENI' })).toEqual(['Андрієнко Ольга', 'Ткач Ярослав']);
    expect(await names(odesa, { active: 'true' })).toEqual(['Ткач Ярослав']);

    expect(await names(admin)).toHaveLength(3);
    expect(await names(admin, { department: 'RENI' })).toEqual(['Бойко Андрій']);
    expect(await names(admin, { department: 'ODESA', active: 'false' })).toEqual([
      'Андрієнко Ольга',
    ]);
  });

  it('keeps a department with engineers from being deleted', async () => {
    const { body: department } = await request(app)
      .post('/api/v1/departments')
      .set(admin.auth)
      .send({ name: 'Тестове', code: 40 });
    await create({ fullName: 'Бойко Андрій', department: department.id });

    const res = await request(app).delete(`/api/v1/departments/${department.id}`).set(admin.auth);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'DEPARTMENT_IN_USE',
      details: { engineers: 1 },
    });
  });
});
