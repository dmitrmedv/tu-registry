import { existsSync } from 'node:fs';
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
import { Project } from './project.model';

const app = createApp();
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);
const imd = (text: string) => Buffer.from(`IMD ${text}`);

describe('projects', () => {
  useTestDb();

  let owner: ApiSession;
  let elsewhere: ApiSession;
  let admin: ApiSession;
  let applicationId: string;
  let tuEngineerId: string;
  let otherEngineerId: string;

  const engineer = async (fullName: string) =>
    String(
      (await Engineer.create({ fullName, department: 'ODESA', createdBy: admin.user._id }))._id,
    );
  const addTu = () =>
    request(app)
      .post(`${APPLICATIONS}/${applicationId}/technical-conditions`)
      .set(owner.auth)
      .send({
        tuNumber: '0032/ТУ',
        preparedDate: '2026-11-16',
        engineer: tuEngineerId,
        gasFlow: '2,5',
        connectionType: 'STANDARD',
        gasPressure: 'LOW',
        connectionPoint: 'UNDERGROUND',
      });

  beforeEach(async () => {
    // Registered on 02.11.2026, TU of 16.11, today 21.11.
    const now = vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-02T09:00:00Z'));
    owner = await signedInWithAuth(app, { login: 'owner' });
    elsewhere = await signedInWithAuth(app, { login: 'elsewhere', department: 'RENI' });
    admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
    applicationId = (await registerApplication(app, owner)).id;
    tuEngineerId = await engineer('Бойко Андрій');
    otherEngineerId = await engineer('Коваль Олена');
    now.mockReturnValue(new Date('2026-11-21T09:00:00Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const url = (path = '') => `${APPLICATIONS}/${applicationId}/projects${path}`;
  const create = (body: Record<string, unknown> = {}, who = owner) =>
    request(app)
      .post(url())
      .set(who.auth)
      .send({ approvalNumber: '125/П', approvalDate: '2026-11-18', ...body });

  it('needs valid technical conditions and takes their engineer by default', async () => {
    expect((await create()).body.error.code).toBe('NO_TECHNICAL_CONDITIONS');
    await addTu();

    const res = await create({ estimateCheckDate: '2026-11-19' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      approvalNumber: '125/П',
      approvalDate: '2026-11-18',
      estimateCheckDate: '2026-11-19',
      engineer: { id: tuEngineerId, fullName: 'Бойко Андрій' },
      scan: null,
      estimateScan: null,
      estimateImd: null,
    });
    expect((await request(app).get(url()).set(elsewhere.auth)).status).toBe(404);
    expect(await ApplicationChange.exists({ 'document.kind': 'PROJECT' })).toBeTruthy();
    const audit = (await AuditLog.findOne({ action: 'PROJECT_CREATED' }).lean())!;
    expect(audit.entityType).toBe('Project');
    expect(audit.details).toMatchObject({ approvalNumber: '125/П' });
    const timeline = await request(app)
      .get(`${APPLICATIONS}/${applicationId}/processing`)
      .set(owner.auth);
    expect(timeline.body.events.at(-1)).toMatchObject({ type: 'PROJECT', number: '125/П' });
  });

  it('keeps one valid project and checks the dates', async () => {
    await addTu();
    expect((await create({ approvalDate: '2026-10-01' })).status).toBe(400);
    expect((await create({ estimateCheckDate: '2026-11-25' })).status).toBe(400);
    const { id } = (await create({ engineer: otherEngineerId })).body;
    expect((await create()).body.error.code).toBe('DOCUMENT_TAKEN');

    const edit = await request(app)
      .patch(url(`/${id}`))
      .set(owner.auth)
      .send({ version: 1, approvalNumber: '126/П', estimateCheckDate: '2026-11-20' });
    expect(edit.body).toMatchObject({
      approvalNumber: '126/П',
      estimateCheckDate: '2026-11-20',
      engineer: { fullName: 'Коваль Олена' },
      version: 2,
    });
    const cleared = await request(app)
      .patch(url(`/${id}`))
      .set(owner.auth)
      .send({ version: 2, estimateCheckDate: null });
    expect(cleared.body.estimateCheckDate).toBeNull();
    const stale = await request(app)
      .patch(url(`/${id}`))
      .set(owner.auth)
      .send({ version: 1, approvalNumber: '127/П' });
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('keeps the project scan, the estimate scan and the IMD check file', async () => {
    await addTu();
    const { id } = (await create()).body;
    const put = (path: string, field: string, file: Buffer, name: string, type: string) =>
      request(app)
        .put(url(`/${id}${path}`))
        .set(owner.auth)
        .attach(field, file, { filename: name, contentType: type });

    expect((await put('/scan', 'scan', pdf('1'), 'Проєкт.pdf', 'application/pdf')).status).toBe(
      200,
    );
    const second = await put('/scan', 'scan', pdf('2'), 'Проєкт 2.pdf', 'application/pdf');
    expect(second.body.scan).toMatchObject({ name: 'Проєкт 2.pdf' });
    expect(second.body.previousScans).toHaveLength(1);

    const estimate = await put(
      '/files/estimateScan',
      'scan',
      pdf('к'),
      'Кошторис.pdf',
      'application/pdf',
    );
    expect(estimate.body.estimateScan).toMatchObject({ name: 'Кошторис.pdf' });
    const check = await put(
      '/files/estimateImd',
      'imd',
      imd('перевірка'),
      'Перевірка.imd',
      'application/octet-stream',
    );
    expect(check.status).toBe(200);
    expect(check.body.estimateImd).toMatchObject({ name: 'Перевірка.imd' });
    expect(
      (await put('/files/estimateImd', 'imd', imd('x'), 'a.pdf', 'application/pdf')).body.error
        .code,
    ).toBe('NOT_IMD');
    expect(
      (await put('/files/estimateImd', 'imd', Buffer.alloc(0), 'a.imd', 'application/octet-stream'))
        .body.error.code,
    ).toBe('NOT_IMD');
    expect(
      (await put('/files/estimateScan', 'scan', imd('x'), 'a.pdf', 'application/pdf')).body.error
        .code,
    ).toBe('SCAN_NOT_PDF');

    const file = await request(app)
      .get(url(`/${id}/files/estimateImd`))
      .set(owner.auth);
    expect(file.headers['content-disposition']).toMatch(/^attachment;/);
    expect(
      (
        await request(app)
          .get(url(`/${id}/files/estimateImd`))
          .set(elsewhere.auth)
      ).status,
    ).toBe(404);

    const stored = (await Project.findById(id).lean())!;
    const replaced = await put(
      '/files/estimateImd',
      'imd',
      imd('нова'),
      'Нова.imd',
      'application/octet-stream',
    );
    expect(replaced.body.estimateImd).toMatchObject({ name: 'Нова.imd' });
    expect(existsSync(scanPath(stored.estimateImd!.fileId, 'imd'))).toBe(false);
    const removed = await request(app)
      .delete(url(`/${id}/files/estimateScan`))
      .set(owner.auth);
    expect(removed.body.estimateScan).toBeNull();
    expect(existsSync(scanPath(stored.estimateScan!.fileId))).toBe(false);
  });

  it('is cancelled, restored and deleted with its files by an admin only', async () => {
    await addTu();
    const { id } = (await create()).body;
    await request(app)
      .put(url(`/${id}/files/estimateImd`))
      .set(owner.auth)
      .attach('imd', imd('x'), { filename: 'x.imd', contentType: 'application/octet-stream' });

    const cancelled = await request(app)
      .post(url(`/${id}/cancel`))
      .set(owner.auth)
      .send({ reason: 'Помилка в даних', version: 1 });
    expect(cancelled.body.cancellation).toMatchObject({ reason: 'Помилка в даних' });
    expect((await create({ approvalNumber: '200/П' })).status).toBe(201);
    expect(
      (
        await request(app)
          .post(url(`/${id}/restore`))
          .set(admin.auth)
          .send({ version: 2 })
      ).status,
    ).toBe(409);

    const file = (await Project.findById(id).lean())!.estimateImd!.fileId;
    expect(
      (
        await request(app)
          .delete(url(`/${id}`))
          .query({ version: 2 })
          .set(owner.auth)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .delete(url(`/${id}`))
          .query({ version: 2 })
          .set(admin.auth)
      ).status,
    ).toBe(204);
    expect(await Project.countDocuments()).toBe(1);
    expect(existsSync(scanPath(file, 'imd'))).toBe(false);
    expect(await AuditLog.exists({ action: 'PROJECT_DELETED' })).toBeTruthy();
  });

  it('goes with its application', async () => {
    await addTu();
    const { id } = (await create()).body;
    await request(app)
      .put(url(`/${id}/files/estimateImd`))
      .set(owner.auth)
      .attach('imd', imd('x'), { filename: 'x.imd', contentType: 'application/octet-stream' });
    const file = (await Project.findById(id).lean())!.estimateImd!.fileId;

    const res = await request(app)
      .delete(`${APPLICATIONS}/${applicationId}`)
      .query({ version: 1 })
      .set(admin.auth);

    expect(res.status).toBe(204);
    expect(await Project.countDocuments()).toBe(0);
    expect(existsSync(scanPath(file, 'imd'))).toBe(false);
  });
});
