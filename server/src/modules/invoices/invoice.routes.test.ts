import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
import { scanPath, storeScan } from '../scans/scan.storage';
import { TechnicalConditions } from '../technicalConditions/technicalConditions.model';
import { dropInvoiceScans } from './invoice.migration';
import { Invoice } from './invoice.model';

const app = createApp();
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);

// The Excel calculation of 2026-11-21: 2 228 653,20 + 121 792,51 + 225 727,08 = 2 576 172,79.
const works = [
  { group: 'CONSTRUCTION', name: 'Будівельно-монтажні роботи', amount: '2 228 653,20' },
  { group: 'TIE_IN', name: 'Врізання', amount: 121792.51 },
  { group: 'WORK_PLAN', name: 'Витрати газу', amount: 37152.36 },
  { group: 'WORK_PLAN', name: 'Встановлення/зняття тимчасових заглушок', amount: 25088.17 },
  { group: 'WORK_PLAN', name: 'Позачерговий техогляд станцій катодного захисту', amount: 16655.56 },
  { group: 'WORK_PLAN', name: 'Пуск та наладка ШРП', amount: 63434 },
  { group: 'WORK_PLAN', name: 'Відновлення газопостачання', amount: 83396.99 },
];

describe('invoices', () => {
  useTestDb();

  let owner: ApiSession;
  let elsewhere: ApiSession;
  let admin: ApiSession;
  let applicationId: string;

  beforeEach(async () => {
    // Registered on 02.11.2026, TU of 05.11, the project approved on 06.11, today 23.11.
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
    now.mockReturnValue(new Date('2026-11-23T09:00:00Z'));
    await request(app)
      .post(`${APPLICATIONS}/${applicationId}/technical-conditions`)
      .set(owner.auth)
      .send({
        tuNumber: '0032/ТУ',
        preparedDate: '2026-11-05',
        engineer: String(engineer._id),
        gasFlow: 2.5,
        connectionType: 'NON_STANDARD',
        gasPressure: 'LOW',
        connectionPoint: 'UNDERGROUND',
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const addProject = () =>
    request(app).post(`${APPLICATIONS}/${applicationId}/projects`).set(owner.auth).send({
      approvalNumber: '86',
      approvalDate: '2026-11-06',
      designOrganization: 'ТОВ «Проєктбуд»',
    });
  const url = (path = '') => `${APPLICATIONS}/${applicationId}/invoices${path}`;
  const create = (body: Record<string, unknown> = {}, who = owner) =>
    request(app)
      .post(url())
      .set(who.auth)
      .send({
        invoiceNumber: '6442/1',
        agreementNumber: 1,
        invoiceDate: '2026-11-20',
        works,
        ...body,
      });

  it('needs a valid project; adds up the groups as the Excel calculation did', async () => {
    expect((await create()).body.error.code).toBe('NO_PROJECT');
    await addProject();

    const res = await create();

    expect(res.status).toBe(201);
    expect(res.body.totals).toEqual({
      CONSTRUCTION: 2228653.2,
      TIE_IN: 121792.51,
      WORK_PLAN: 225727.08,
      EARTHWORKS: 0,
      total: 2576172.79,
    });
    expect(res.body.works).toHaveLength(7);
    expect(res.body.agreementNumber).toBe(1);
    expect((await create({ agreementNumber: '' })).body.error.details.fieldErrors).toEqual({
      agreementNumber: ['Вкажіть № додаткової угоди'],
    });
    // 06.11 → 20.11, both counted as in Excel (2026-11-22): eleven working days, one too many.
    expect(res.body).toMatchObject({ workingDays: 11, overdueBy: 1 });
    expect((await request(app).get(url()).set(elsewhere.auth)).status).toBe(404);
    expect(await ApplicationChange.exists({ 'document.kind': 'INVOICE' })).toBeTruthy();
    const audit = (await AuditLog.findOne({ action: 'INVOICE_CREATED' }).lean())!;
    expect(audit.details).toMatchObject({ invoiceNumber: '6442/1' });
    const timeline = await request(app)
      .get(`${APPLICATIONS}/${applicationId}/processing`)
      .set(owner.auth);
    expect(timeline.body.events.at(-1)).toMatchObject({
      type: 'INVOICE',
      number: '6442/1',
      norm: 10,
      overdueBy: 1,
    });
  });

  it('takes several invoices, shows a late one as overdue, checks the works and dates', async () => {
    await addProject();
    // 06.11 → 19.11: the tenth working day, the last of the term.
    const inTime = await create({ invoiceDate: '2026-11-19' });
    expect(inTime.body).toMatchObject({ workingDays: 10, overdueBy: 0 });
    const late = await create({ invoiceNumber: '6442/2', invoiceDate: '2026-11-23' });
    expect(late.body).toMatchObject({ workingDays: 12, overdueBy: 2 });

    expect((await create({ invoiceDate: '2026-11-05' })).body.error.details.fieldErrors).toEqual({
      invoiceDate: [expect.stringMatching(/^Дата розрахунку не може бути раніше дати узгодження/)],
    });
    expect((await create({ works: [] })).status).toBe(400);
    expect(
      (await create({ works: [{ group: 'TIE_IN', name: 'Врізання', amount: 0 }] })).status,
    ).toBe(400);
  });

  it('takes several works of a group, and the earthworks permits only underground', async () => {
    await addProject();
    const geodesy = { group: 'EARTHWORKS', name: 'Нанесення геодезії', amount: 1000 };
    const twice = await create({
      works: [...works, { group: 'TIE_IN', name: 'Врізання', amount: 1 }],
    });
    expect(twice.body.totals).toMatchObject({ TIE_IN: 121793.51 });
    const res = await create({ works: [...works, geodesy] });
    expect(res.body.totals).toMatchObject({ EARTHWORKS: 1000, total: 2577172.79 });

    await TechnicalConditions.updateOne({}, { connectionPoint: 'ABOVE_GROUND' });
    // Above ground there are no earthworks: no permit of any kind.
    const permit = {
      group: 'EARTHWORKS',
      name: 'Отримання дозволу на земляні роботи',
      amount: 500,
    };
    for (const work of [geodesy, permit]) {
      const above = await create({ works: [...works, work] });
      expect(above.body.error.details.fieldErrors).toEqual({
        works: ['Дозволи на земляні роботи — лише коли точка приєднання — підземний газопровід'],
      });
    }
  });

  it('is made without a number; the number is added when the accounts department gives it', async () => {
    await addProject();
    const res = await create({ invoiceNumber: '  ' });
    expect(res.body).toMatchObject({ invoiceNumber: null, version: 1 });
    expect(
      await ApplicationChange.exists({ 'document.kind': 'INVOICE', 'document.number': 'б/н' }),
    ).toBeTruthy();

    const numbered = await request(app)
      .patch(url(`/${res.body.id}`))
      .set(owner.auth)
      .send({
        version: 1,
        invoiceNumber: '6442/1',
        agreementNumber: 1,
        invoiceDate: '2026-11-20',
        comment: '  Оплата частинами ',
        works,
      });
    expect(numbered.body).toMatchObject({
      invoiceNumber: '6442/1',
      comment: 'Оплата частинами',
      version: 2,
    });
    const change = (await AuditLog.findOne({ action: 'INVOICE_UPDATED' }).lean())!;
    expect(change.details).toMatchObject({
      changes: [
        { field: 'invoiceNumber', from: null, to: '6442/1' },
        { field: 'comment', from: null, to: 'Оплата частинами' },
      ],
    });
  });

  it('changes the invoice the user saw, journalling the total', async () => {
    await addProject();
    const { id } = (await create()).body;
    const edit = await request(app)
      .patch(url(`/${id}`))
      .set(owner.auth)
      .send({
        version: 1,
        invoiceNumber: '6442/1',
        agreementNumber: 1,
        invoiceDate: '2026-11-20',
        works: [{ group: 'TIE_IN', name: 'Врізання', amount: 100 }],
      });
    expect(edit.body).toMatchObject({ totals: { total: 100 }, version: 2 });
    const change = (await AuditLog.findOne({ action: 'INVOICE_UPDATED' }).lean())!;
    expect(change.details).toMatchObject({
      changes: [{ field: 'works', from: expect.stringMatching(/2\s576\s172,79 грн/) }],
    });
    const stale = await request(app)
      .patch(url(`/${id}`))
      .set(owner.auth)
      .send({
        version: 1,
        invoiceNumber: 'x',
        agreementNumber: 1,
        invoiceDate: '2026-11-20',
        works,
      });
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('keeps the basis document, PDF only; the scan is gone', async () => {
    await addProject();
    const { id } = (await create()).body;
    const put = (kind: string, file: Buffer, name: string) =>
      request(app)
        .put(url(`/${id}/files/${kind}`))
        .set(owner.auth)
        .attach('scan', file, { filename: name, contentType: 'application/pdf' });

    expect((await put('scan', pdf('р'), 'Розрахунок.pdf')).status).toBe(400);
    expect((await put('basis', pdf('п'), 'Підстава.pdf')).body.basis).toMatchObject({
      name: 'Підстава.pdf',
    });
    expect((await put('basis', Buffer.from('not a pdf'), 'x.pdf')).body.error.code).toBe(
      'SCAN_NOT_PDF',
    );
    expect((await put('other', pdf('x'), 'x.pdf')).status).toBe(400);
    const first = (await Invoice.findById(id).lean())!.basis!.fileId;
    await put('basis', pdf('п2'), 'Підстава 2.pdf');
    expect(existsSync(scanPath(first))).toBe(false);
    const file = await request(app)
      .get(url(`/${id}/files/basis`))
      .set(owner.auth);
    expect(file.headers['content-type']).toBe('application/pdf');
  });

  it('drops the scans saved before 2026-11-22 with their files, the basis stays', async () => {
    await addProject();
    const { id } = (await create()).body;
    await request(app)
      .put(url(`/${id}/files/basis`))
      .set(owner.auth)
      .attach('scan', pdf('п'), { filename: 'п.pdf', contentType: 'application/pdf' });
    const temp = path.join(tmpdir(), `invoice-scan-${Date.now()}.pdf`);
    await writeFile(temp, pdf('р'));
    const fileId = await storeScan(temp, 'pdf');
    await Invoice.collection.updateOne(
      { _id: (await Invoice.findById(id))!._id },
      { $set: { scan: { fileId, name: 'р.pdf', size: 1, uploadedAt: new Date() } } },
    );

    expect(await dropInvoiceScans()).toBe(1);
    expect(existsSync(scanPath(fileId))).toBe(false);
    const row = (await Invoice.collection.findOne({}))!;
    expect(row).not.toHaveProperty('scan');
    expect(row.basis).toMatchObject({ name: 'п.pdf' });
    expect(await dropInvoiceScans()).toBe(0);
  });

  it('is cancelled with a reason, restored and deleted by an admin only, and goes with its application', async () => {
    await addProject();
    const { id } = (await create()).body;
    await request(app)
      .put(url(`/${id}/files/basis`))
      .set(owner.auth)
      .attach('scan', pdf('п'), { filename: 'п.pdf', contentType: 'application/pdf' });

    const cancelled = await request(app)
      .post(url(`/${id}/cancel`))
      .set(owner.auth)
      .send({ reason: 'Помилка в сумі', version: 1 });
    expect(cancelled.body.cancellation).toMatchObject({ reason: 'Помилка в сумі' });
    const restore = (who: ApiSession) =>
      request(app)
        .post(url(`/${id}/restore`))
        .set(who.auth)
        .send({ version: 2 });
    expect((await restore(owner)).status).toBe(403);
    expect((await restore(admin)).body).toMatchObject({ cancellation: null, version: 3 });

    const file = (await Invoice.findById(id).lean())!.basis!.fileId;
    expect(
      (
        await request(app)
          .delete(`${APPLICATIONS}/${applicationId}`)
          .query({ version: 1 })
          .set(admin.auth)
      ).status,
    ).toBe(204);
    expect(await Invoice.countDocuments()).toBe(0);
    expect(existsSync(scanPath(file))).toBe(false);
  });
});
