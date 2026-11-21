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
import { Contract } from './contract.model';

const app = createApp();
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);
// A .docx is a ZIP archive; its signature is what the server checks.
const docx = (text: string) =>
  Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.from(text)]);
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('contracts', () => {
  useTestDb();

  let owner: ApiSession;
  let elsewhere: ApiSession;
  let admin: ApiSession;
  let applicationId: string;
  let engineerId: string;

  const addTu = (connectionType = 'NON_STANDARD', id = applicationId) =>
    request(app).post(`${APPLICATIONS}/${id}/technical-conditions`).set(owner.auth).send({
      tuNumber: '0032/ТУ',
      preparedDate: '2026-11-16',
      engineer: engineerId,
      gasFlow: '2,5',
      connectionType,
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
      customer: 'Франко Іван Якович',
      address: 'м. Одеса, вул. Лесі Українки, 34',
    });

  beforeEach(async () => {
    // Registered on 02.11.2026 (ODESA, code 8), TU of 16.11, today 20.11.
    const now = vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-02T09:00:00Z'));
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

  const url = (path = '', id = applicationId) => `${APPLICATIONS}/${id}/contracts${path}`;
  const draft = (who = owner, query: Record<string, string> = {}) =>
    request(app).get(url('/draft')).query(query).set(who.auth);
  const contract = {
    contractNumber: '1-8',
    contractDate: '2026-11-16',
    department: 'ODESA',
    customer: 'Франко Іван Якович',
    address: 'м. Одеса, вул. Лесі Українки, 34',
  };
  const create = (body: Record<string, unknown> = {}, who = owner, id = applicationId) =>
    request(app)
      .post(url('', id))
      .set(who.auth)
      .send({ ...contract, ...body });

  it('starts from the valid TU and the next number of the department', async () => {
    expect((await draft()).body.error.code).toBe('NO_TECHNICAL_CONDITIONS');
    await addTu();

    const res = await draft();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      connectionType: 'NON_STANDARD',
      contractNumber: '1-8',
      contractDate: '2026-11-16',
      department: 'ODESA',
      customer: 'Франко Іван Якович',
      address: 'м. Одеса, вул. Лесі Українки, 34',
    });
  });

  it('adds a contract, journalled in the history and in the audit without customer data', async () => {
    await addTu();

    const res = await create({ representative: 'Франко Тарас', comment: 'Довіреність № 5' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      connectionType: 'NON_STANDARD',
      contractNumber: '1-8',
      contractDate: '2026-11-16',
      signedDate: null,
      representative: 'Франко Тарас',
      document: null,
      scan: null,
      cancellation: null,
      createdBy: { fullName: owner.user.fullName },
      version: 1,
    });
    expect((await Contract.findOne().lean())!.sequence).toBe(1);
    expect((await request(app).get(url()).set(owner.auth)).body).toHaveLength(1);
    const entry = await AuditLog.findOne({ action: 'CONTRACT_CREATED' }).lean();
    expect(entry).toMatchObject({
      entityType: 'Contract',
      details: { regNumber: '1т/26-8', contractNumber: '1-8', contractDate: '2026-11-16' },
    });
    expect(JSON.stringify(entry!.details)).not.toContain('Франко');
    expect(await ApplicationChange.findOne({ 'document.kind': 'CONTRACT' }).lean()).toMatchObject({
      action: 'CREATED',
      document: { number: '1-8' },
    });
  });

  it('numbers after the largest number of the department, with «Р» for a reconstruction', async () => {
    await addTu('RECONSTRUCTION');
    await create({ contractNumber: '41-8' });
    await request(app)
      .post(url(`/${(await Contract.findOne().lean())!._id}/cancel`))
      .set(owner.auth)
      .send({ reason: 'Помилка в даних', version: 1 });

    // The cancelled contract keeps its number: the next one follows it.
    expect((await draft()).body).toMatchObject({ contractNumber: '42-8-Р' });
    // Another department has its own sequence.
    expect((await draft(admin, { department: 'RENI' })).body.contractNumber).toMatch(/^1-\d+-Р$/);
  });

  it('leaves the number and the date to the user while a valid contract exists', async () => {
    await addTu();
    await create();

    expect((await draft()).body).toMatchObject({ contractNumber: null, contractDate: null });
    // A number of the sequence is taken once per department, «Р» or not.
    const taken = await create({ contractNumber: '1-8-Р' });
    expect(taken.status).toBe(409);
    expect(taken.body.error.details.fieldErrors.contractNumber).toEqual([
      'Договір № 1-8-Р уже є в цьому управлінні',
    ]);
    // A number written another way is not in the sequence.
    expect((await create({ contractNumber: 'Д-7/2026' })).status).toBe(201);
  });

  it('checks the dates', async () => {
    await addTu();
    expect((await create({ contractDate: '2026-11-01' })).body.error.details.fieldErrors).toEqual({
      contractDate: ['Дата договору не може бути раніше дати реєстрації заяви (02.11.2026)'],
    });
    expect((await create({ signedDate: '2026-11-21' })).body.error.details.fieldErrors).toEqual({
      signedDate: ['Дата укладання договору не може бути в майбутньому'],
    });
  });

  it('changes a contract the user saw, with the changes in the history', async () => {
    await addTu();
    const { id } = (await create()).body;

    const res = await request(app)
      .patch(url(`/${id}`))
      .set(owner.auth)
      .send({ ...contract, version: 1, signedDate: '2026-11-19', representative: 'Франко Тарас' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ signedDate: '2026-11-19', version: 2 });
    const stale = await request(app)
      .patch(url(`/${id}`))
      .set(owner.auth)
      .send({ ...contract, version: 1 });
    expect(stale.status).toBe(409);
    const change = await ApplicationChange.findOne({ action: 'UPDATED' }).lean();
    expect(change!.changes.map((c) => c.field)).toEqual(['signedDate', 'representative']);
    const entry = await AuditLog.findOne({ action: 'CONTRACT_UPDATED' }).lean();
    expect(entry!.details).toMatchObject({
      changes: [{ field: 'signedDate', from: null, to: '2026-11-19' }, { field: 'representative' }],
    });
  });

  it('keeps the Word document and the signed scan, checking what they are', async () => {
    await addTu();
    const { id } = (await create()).body;
    const upload = (kind: 'document' | 'scan', file: Buffer, name: string, type: string) =>
      request(app)
        .put(url(`/${id}/files/${kind}`))
        .set(owner.auth)
        .attach(kind === 'document' ? 'document' : 'scan', file, {
          filename: name,
          contentType: type,
        });

    const word = await upload('document', docx('договір'), 'Договір 1-8.docx', DOCX_TYPE);
    expect(word.status).toBe(200);
    expect(word.body.document).toMatchObject({ name: 'Договір 1-8.docx' });
    const signed = await upload('scan', pdf('підписаний'), 'Договір.pdf', 'application/pdf');
    expect(signed.body.scan).toMatchObject({ name: 'Договір.pdf' });
    expect((await upload('document', pdf('ні'), 'Договір.docx', DOCX_TYPE)).body.error.code).toBe(
      'NOT_DOCX',
    );
    expect((await upload('document', docx('ні'), 'a.pdf', 'application/pdf')).status).toBe(400);

    const download = await request(app)
      .get(url(`/${id}/files/document`))
      .set(elsewhere.auth);
    expect(download.status).toBe(404);
    const file = await request(app)
      .get(url(`/${id}/files/document`))
      .set(owner.auth);
    expect(file.headers['content-type']).toBe(DOCX_TYPE);
    expect(file.headers['content-disposition']).toMatch(/^attachment;/);

    const stored = (await Contract.findById(id).lean())!;
    const removed = await request(app)
      .delete(url(`/${id}/files/document`))
      .set(owner.auth);
    expect(removed.body.document).toBeNull();
    expect(existsSync(scanPath(stored.document!.fileId, 'docx'))).toBe(false);
    expect(existsSync(scanPath(stored.scan!.fileId))).toBe(true);
  });

  it('is cancelled by the department, deleted for good only by an admin', async () => {
    await addTu();
    const { id } = (await create()).body;
    await request(app)
      .put(url(`/${id}/files/scan`))
      .set(owner.auth)
      .attach('scan', pdf('скан'), { filename: 'скан.pdf', contentType: 'application/pdf' });

    expect(
      (
        await request(app)
          .post(url(`/${id}/cancel`))
          .set(elsewhere.auth)
          .send({ reason: 'Не те', version: 1 })
      ).status,
    ).toBe(404);
    const cancelled = await request(app)
      .post(url(`/${id}/cancel`))
      .set(owner.auth)
      .send({ reason: 'Помилка в даних', version: 1 });
    expect(cancelled.body.cancellation).toMatchObject({ reason: 'Помилка в даних' });
    const edit = await request(app)
      .patch(url(`/${id}`))
      .set(owner.auth)
      .send({ ...contract, version: 2 });
    expect(edit.body.error.code).toBe('DOCUMENT_CANCELLED');

    const file = (await Contract.findById(id).lean())!.scan!.fileId;
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
    expect(await Contract.countDocuments()).toBe(0);
    expect(existsSync(scanPath(file))).toBe(false);
    expect(await AuditLog.exists({ action: 'CONTRACT_DELETED' })).toBeTruthy();
  });

  it('goes with its application', async () => {
    await addTu();
    const { id } = (await create()).body;
    await request(app)
      .put(url(`/${id}/files/document`))
      .set(owner.auth)
      .attach('document', docx('договір'), { filename: 'д.docx', contentType: DOCX_TYPE });
    const file = (await Contract.findById(id).lean())!.document!.fileId;

    const res = await request(app)
      .delete(`${APPLICATIONS}/${applicationId}`)
      .query({ version: 1 })
      .set(admin.auth);

    expect(res.status).toBe(204);
    expect(await Contract.countDocuments()).toBe(0);
    expect(existsSync(scanPath(file, 'docx'))).toBe(false);
  });
});
