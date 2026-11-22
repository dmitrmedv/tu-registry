import { existsSync } from 'node:fs';
import { formatHryvnias } from '@tu-registry/shared';
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
import { ApplicationChange } from '../applications/applicationChange.model';
import { AuditLog } from '../audit/auditLog.model';
import { Engineer } from '../engineers/engineer.model';
import { scanPath } from '../scans/scan.storage';
import { Project } from '../projects/project.model';
import { moveProjectEstimates } from './estimate.migration';
import { Estimate } from './estimate.model';

const app = createApp();
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);
const imd = (text: string) => Buffer.from(`IMD ${text}`);

describe('estimates', () => {
  useTestDb();

  let owner: ApiSession;
  let elsewhere: ApiSession;
  let admin: ApiSession;
  let applicationId: string;
  let projectId: string;

  const base = () => `${APPLICATIONS}/${applicationId}`;
  const url = (path = '') => `${base()}/estimates${path}`;
  const create = (body: Record<string, unknown> = {}) =>
    request(app).post(url()).set(owner.auth).send(body);
  const put = (id: string, kind: string, file: Buffer, name: string, type: string) =>
    request(app)
      .put(url(`/${id}/files/${kind}`))
      .set(owner.auth)
      .attach(kind, file, { filename: name, contentType: type });

  beforeEach(async () => {
    // Registered on 02.11.2026, TU of 16.11, project of 18.11, today 21.11.
    const now = vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-02T09:00:00Z'));
    owner = await signedInWithAuth(app, { login: 'owner' });
    elsewhere = await signedInWithAuth(app, { login: 'elsewhere', department: 'RENI' });
    admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
    applicationId = (await registerApplication(app, owner)).id;
    const engineer = await Engineer.create({
      fullName: 'Бойко Андрій',
      department: 'ODESA',
      createdBy: admin.user._id,
    });
    now.mockReturnValue(new Date('2026-11-21T09:00:00Z'));
    await request(app)
      .post(`${base()}/technical-conditions`)
      .set(owner.auth)
      .send({
        tuNumber: '0032/ТУ',
        preparedDate: '2026-11-16',
        engineer: String(engineer._id),
        gasFlow: '2,5',
        connectionType: 'STANDARD',
        gasPressure: 'LOW',
        connectionPoint: 'UNDERGROUND',
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const addProject = async () => {
    projectId = (
      await request(app).post(`${base()}/projects`).set(owner.auth).send({
        approvalNumber: '125/П',
        approvalDate: '2026-11-18',
        designOrganization: 'ТОВ «Проєктбуд»',
      })
    ).body.id;
  };

  it('needs a valid project, keeps the sum in kopecks and checks the date', async () => {
    expect((await create()).body.error.code).toBe('NO_PROJECT');
    await addProject();
    expect((await create({ checkDate: '2026-11-25' })).status).toBe(400);
    expect((await create({ amount: '-1' })).status).toBe(400);
    expect((await create({ subcontractAmount: '-1' })).status).toBe(400);

    const res = await create({
      checkDate: '2026-11-19',
      amount: '12 345,67',
      subcontractAmount: '4 000,50',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      projectId,
      checkDate: '2026-11-19',
      amount: 12345.67,
      subcontractAmount: 4000.5,
      scan: null,
      imd: null,
      superseded: null,
      version: 1,
    });
    expect(await Estimate.findById(res.body.id).lean()).toMatchObject({
      amountKopecks: 1234567,
      subcontractAmountKopecks: 400050,
    });
    expect((await request(app).get(url()).set(elsewhere.auth)).status).toBe(404);
    expect(
      await ApplicationChange.exists({ 'document.kind': 'ESTIMATE', 'document.number': '125/П' }),
    ).toBeTruthy();
    const audit = (await AuditLog.findOne({ action: 'ESTIMATE_CREATED' }).lean())!;
    expect(audit.entityType).toBe('Estimate');
    expect(audit.details).toMatchObject({
      approvalNumber: '125/П',
      amount: formatHryvnias(12345.67),
      subcontractAmount: formatHryvnias(4000.5),
    });

    const edit = await request(app)
      .patch(url(`/${res.body.id}`))
      .set(owner.auth)
      .send({ version: 1, checkDate: null, amount: '100' });
    // Not sent, so cleared: the form always sends the whole estimate.
    expect(edit.body).toMatchObject({
      checkDate: null,
      amount: 100,
      subcontractAmount: null,
      version: 2,
    });
    const change = (await AuditLog.findOne({ action: 'ESTIMATE_UPDATED' }).lean())!;
    expect(change.details).toMatchObject({
      changes: expect.arrayContaining([
        { field: 'subcontractAmount', from: formatHryvnias(4000.5), to: null },
      ]),
    });
    const stale = await request(app)
      .patch(url(`/${res.body.id}`))
      .set(owner.auth)
      .send({ version: 1, amount: '200' });
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('is recalculated without touching the project: the old one stays with its files', async () => {
    await addProject();
    const first = (await create({ amount: '1000' })).body;
    await put(first.id, 'imd', imd('1'), 'Перший.imd', 'application/octet-stream');

    const second = await create({ amount: '1500' });

    expect(second.status).toBe(201);
    const list = (await request(app).get(url()).set(owner.auth)).body;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      id: first.id,
      amount: 1000,
      imd: { name: 'Перший.imd' },
      superseded: { by: { id: String(owner.user._id) } },
      version: 2,
    });
    expect(list[1]).toMatchObject({ id: second.body.id, amount: 1500, superseded: null });
    const project = (await request(app).get(`${base()}/projects`).set(owner.auth)).body[0];
    expect(project.version).toBe(1);

    // Only the current estimate changes.
    const old = await request(app)
      .patch(url(`/${first.id}`))
      .set(owner.auth)
      .send({ version: 2, amount: '1' });
    expect(old.body.error.code).toBe('ESTIMATE_SUPERSEDED');
    expect((await put(first.id, 'scan', pdf('x'), 'a.pdf', 'application/pdf')).status).toBe(409);
    expect(
      (
        await request(app)
          .get(url(`/${first.id}/files/imd`))
          .set(owner.auth)
      ).status,
    ).toBe(200);
  });

  it('keeps one scan and one IMD file, replacing them', async () => {
    await addProject();
    const { id } = (await create()).body;

    const scan = await put(id, 'scan', pdf('к'), 'Кошторис.pdf', 'application/pdf');
    expect(scan.body.scan).toMatchObject({ name: 'Кошторис.pdf' });
    const check = await put(id, 'imd', imd('п'), 'Перевірка.imd', 'application/octet-stream');
    expect(check.body.imd).toMatchObject({ name: 'Перевірка.imd' });
    expect((await put(id, 'imd', imd('x'), 'a.pdf', 'application/pdf')).body.error.code).toBe(
      'NOT_IMD',
    );
    expect(
      (await put(id, 'imd', Buffer.alloc(0), 'a.imd', 'application/octet-stream')).body.error.code,
    ).toBe('NOT_IMD');
    expect((await put(id, 'scan', imd('x'), 'a.pdf', 'application/pdf')).body.error.code).toBe(
      'SCAN_NOT_PDF',
    );

    const file = await request(app)
      .get(url(`/${id}/files/imd`))
      .set(owner.auth);
    expect(file.headers['content-disposition']).toMatch(/^attachment;/);
    expect(
      (
        await request(app)
          .get(url(`/${id}/files/imd`))
          .set(elsewhere.auth)
      ).status,
    ).toBe(404);

    const stored = (await Estimate.findById(id).lean())!;
    const replaced = await put(id, 'imd', imd('нова'), 'Нова.imd', 'application/octet-stream');
    expect(replaced.body.imd).toMatchObject({ name: 'Нова.imd' });
    expect(existsSync(scanPath(stored.imd!.fileId, 'imd'))).toBe(false);
    const removed = await request(app)
      .delete(url(`/${id}/files/scan`))
      .set(owner.auth);
    expect(removed.body.scan).toBeNull();
    expect(existsSync(scanPath(stored.scan!.fileId))).toBe(false);
  });

  it('is read-only once its project is cancelled', async () => {
    await addProject();
    const { id } = (await create()).body;
    await request(app)
      .post(`${base()}/projects/${projectId}/cancel`)
      .set(owner.auth)
      .send({ reason: 'Помилка', version: 1 });

    const edit = await request(app)
      .patch(url(`/${id}`))
      .set(owner.auth)
      .send({ version: 1, amount: '5' });
    expect(edit.body.error.code).toBe('DOCUMENT_CANCELLED');
    expect((await create()).body.error.code).toBe('NO_PROJECT');
  });

  it('is deleted by an admin only; the replaced one becomes current again', async () => {
    await addProject();
    const first = (await create({ amount: '1000' })).body;
    const second = (await create({ amount: '1500' })).body;
    await put(second.id, 'imd', imd('x'), 'x.imd', 'application/octet-stream');
    const file = (await Estimate.findById(second.id).lean())!.imd!.fileId;

    const del = (who: ApiSession) =>
      request(app)
        .delete(url(`/${second.id}`))
        .query({ version: 1 })
        .set(who.auth);
    expect((await del(owner)).status).toBe(403);
    expect((await del(admin)).status).toBe(204);

    expect(existsSync(scanPath(file, 'imd'))).toBe(false);
    const list = (await request(app).get(url()).set(owner.auth)).body;
    expect(list).toEqual([expect.objectContaining({ id: first.id, superseded: null })]);
    expect(await AuditLog.exists({ action: 'ESTIMATE_DELETED' })).toBeTruthy();
  });
  it('moves the estimate out of a project entered before the split', async () => {
    await addProject();
    const fileId = 'a'.repeat(32);
    await Project.collection.updateOne(
      {},
      {
        $set: {
          estimateCheckDate: new Date('2026-11-19T00:00:00Z'),
          estimateImd: {
            fileId,
            name: 'Перевірка.imd',
            size: 10,
            uploadedAt: new Date('2026-11-20T09:00:00Z'),
            uploadedBy: owner.user._id,
          },
        },
      },
    );

    expect(await moveProjectEstimates()).toBe(1);
    expect(await moveProjectEstimates()).toBe(0);
    const [estimate] = (await request(app).get(url()).set(owner.auth)).body;
    expect(estimate).toMatchObject({
      projectId,
      checkDate: '2026-11-19',
      amount: null,
      subcontractAmount: null,
      imd: { name: 'Перевірка.imd' },
      superseded: null,
    });
    const project = await Project.collection.findOne({});
    expect(project).not.toHaveProperty('estimateCheckDate');
    expect(project).not.toHaveProperty('estimateImd');
  });
});
