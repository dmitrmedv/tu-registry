import { existsSync } from 'node:fs';
import type { TuPaymentScanKind } from '@tu-registry/shared';
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
import { AuditLog } from '../audit/auditLog.model';
import { Engineer } from '../engineers/engineer.model';
import { scanPath } from '../scans/scan.storage';
import { moveActTransferDateToMonth } from './tuPayment.migration';
import { TuPayment } from './tuPayment.model';

const app = createApp();
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);

describe('payment for technical conditions', () => {
  useTestDb();

  let owner: ApiSession;
  let elsewhere: ApiSession;
  let admin: ApiSession;
  let applicationId: string;
  let tuId: string;

  beforeEach(async () => {
    // Registered on 02.11.2026, TU of 16.11, today 20.11.
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
    now.mockReturnValue(new Date('2026-11-20T09:00:00Z'));
    const { body } = await request(app)
      .post(`${APPLICATIONS}/${applicationId}/technical-conditions`)
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
    tuId = body.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const tuUrl = () => `${APPLICATIONS}/${applicationId}/technical-conditions`;
  const url = (path = '') => `${tuUrl()}/${tuId}/payment${path}`;
  const invoice = { invoiceNumber: '125/Б', invoiceDate: '2026-11-17', amount: '1 234,56' };
  const save = (body: Record<string, unknown> = {}, who = owner) =>
    request(app)
      .put(url())
      .set(who.auth)
      .send({ ...invoice, ...body });
  const upload = (kind: TuPaymentScanKind, text: string, who = owner) =>
    request(app)
      .put(url(`/scans/${kind}`))
      .set(who.auth)
      .attach('scan', pdf(text), { filename: `${text}.pdf`, contentType: 'application/pdf' });
  const remove = (version: number, who = admin) =>
    request(app).delete(url()).query({ version }).set(who.auth);

  it('enters the invoice into the technical conditions, audited without customer data', async () => {
    const res = await save();

    expect(res.status).toBe(200);
    expect(res.body.payment).toMatchObject({
      invoiceNumber: '125/Б',
      invoiceDate: '2026-11-17',
      amount: 1234.56,
      paidDate: null,
      actTransferMonth: null,
      receiptScan: null,
      actScan: null,
      createdBy: { fullName: owner.user.fullName },
      version: 1,
    });
    expect((await TuPayment.findOne().lean())!).toMatchObject({
      amountKopecks: 123456,
      department: 'ODESA',
    });
    const list = await request(app).get(tuUrl()).set(owner.auth);
    expect(list.body[0].payment.invoiceNumber).toBe('125/Б');

    const entry = await AuditLog.findOne({ action: 'TU_PAYMENT_CREATED' }).lean();
    expect(entry).toMatchObject({
      entityType: 'TuPayment',
      details: {
        regNumber: '1т/26-8',
        tuNumber: '0032/ТУ',
        invoiceNumber: '125/Б',
        invoiceDate: '2026-11-17',
      },
    });
    const journal = await request(app).get('/api/v1/audit').set(admin.auth);
    expect(journal.body.data[0].entityLabel).toBe('125/Б до ТУ 0032/ТУ, заява 1т/26-8');
  });

  it('checks the dates against the registration, today and each other; the month too', async () => {
    expect((await save({ invoiceDate: '2026-11-01' })).body.error.details.fieldErrors).toEqual({
      invoiceDate: ['Дата рахунку не може бути раніше дати реєстрації заяви (02.11.2026)'],
    });
    expect((await save({ paidDate: '2026-11-21' })).body.error.details.fieldErrors).toEqual({
      paidDate: ['Дата оплати не може бути в майбутньому'],
    });
    expect((await save({ actTransferMonth: '2026-11' })).status).toBe(400);
    expect(await TuPayment.countDocuments()).toBe(0);
  });

  it('takes a coming month for handing the act to accounting', async () => {
    const saved = await save({ paidDate: '2026-11-18', actTransferMonth: '2027-01' });
    expect(saved.status).toBe(200);
    expect(saved.body.payment.actTransferMonth).toBe('2027-01');
  });

  it('is filled over time with the version seen; a second invoice is refused', async () => {
    await save();
    expect((await save()).body.error.code).toBe('PAYMENT_EXISTS');

    const paid = await save({ version: 1, paidDate: '2026-11-18' });
    expect(paid.body.payment).toMatchObject({ paidDate: '2026-11-18', version: 2 });
    expect((await save({ version: 1, paidDate: '2026-11-19' })).body.error.code).toBe(
      'VERSION_CONFLICT',
    );
    // The bank rounded: the sum actually paid is its own field, only with the payment date.
    expect(
      (await save({ version: 2, paidAmount: '1499,99' })).body.error.details.fieldErrors,
    ).toEqual({ paidAmount: ['Вкажіть і дату оплати'] });
    const done = await save({
      version: 2,
      amount: 1500,
      paidDate: '2026-11-18',
      paidAmount: '1499,99',
      actTransferMonth: '2026-11',
    });
    expect(done.body.payment).toMatchObject({
      amount: 1500,
      paidAmount: 1499.99,
      actTransferMonth: '2026-11',
      version: 3,
    });
    // Nothing new: no new version, no entry.
    expect(
      (
        await save({
          version: 3,
          amount: '1500,00',
          paidDate: '2026-11-18',
          paidAmount: 1499.99,
          actTransferMonth: '2026-11',
        })
      ).body.payment.version,
    ).toBe(3);

    const updates = await AuditLog.find({ action: 'TU_PAYMENT_UPDATED' }).sort({ _id: 1 }).lean();
    // uk-UA groups thousands with a no-break space.
    const changes = JSON.parse(
      JSON.stringify(updates.map((e) => e.details.changes)).replace(/\u00a0|\u202f/g, ' '),
    );
    expect(changes).toEqual([
      [{ field: 'paidDate', from: null, to: '2026-11-18' }],
      [
        { field: 'amount', from: '1 234,56 грн', to: '1 500,00 грн' },
        { field: 'paidAmount', from: null, to: '1 499,99 грн' },
        { field: 'actTransferMonth', from: null, to: '2026-11' },
      ],
    ]);
  });

  it('keeps one scan of each kind: a replaced file is deleted, a removed one too', async () => {
    expect((await upload('receipt', 'квитанція')).status).toBe(404); // no invoice yet
    await save();

    await upload('receipt', 'квитанція');
    const first = (await TuPayment.findOne().lean())!.receiptScan!.fileId;
    const { body } = await upload('receipt', 'квитанція-2');
    await upload('act', 'акт');

    expect(body.payment.receiptScan.name).toBe('квитанція-2.pdf');
    expect(existsSync(scanPath(first))).toBe(false);
    const download = await request(app).get(url('/scans/act')).set(admin.auth);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect((await request(app).get(url('/scans/act')).set(elsewhere.auth)).status).toBe(404);
    expect((await upload('act', 'чуже', elsewhere)).status).toBe(404);
    expect((await request(app).get(url('/scans/other')).set(owner.auth)).status).toBe(400);

    // The invoice's own scan (2026-11-19), and the files go with the payment.
    const invoiceScan = await upload('invoice', 'рахунок');
    expect(invoiceScan.body.payment.invoiceScan.name).toBe('рахунок.pdf');
    expect((await request(app).get(url('/scans/invoice')).set(owner.auth)).status).toBe(200);

    const act = (await TuPayment.findOne().lean())!.actScan!.fileId;
    const removed = await request(app).delete(url('/scans/act')).set(owner.auth);
    expect(removed.body.payment.actScan).toBeNull();
    expect(existsSync(scanPath(act))).toBe(false);
    const entries = await AuditLog.find({ action: 'TU_PAYMENT_UPDATED' }).lean();
    expect(entries.map((entry) => entry.details.changes[0])).toEqual([
      { field: 'receiptScan', from: null, to: 'новий файл' },
      { field: 'receiptScan', from: 'файл', to: 'новий файл' },
      { field: 'actScan', from: null, to: 'новий файл' },
      { field: 'invoiceScan', from: null, to: 'новий файл' },
      { field: 'actScan', from: 'файл', to: null },
    ]);
  });

  it('is deleted by an admin only, with its files', async () => {
    await save();
    await upload('receipt', 'квитанція');
    await upload('invoice', 'рахунок');
    const stored = (await TuPayment.findOne().lean())!;
    const file = stored.receiptScan!.fileId;
    const invoiceFile = stored.invoiceScan!.fileId;

    expect((await remove(1, owner)).status).toBe(403);
    expect((await remove(2)).body.error.code).toBe('VERSION_CONFLICT');
    const res = await remove(1);

    expect(res.status).toBe(200);
    expect(res.body.payment).toBeNull();
    expect(await TuPayment.countDocuments()).toBe(0);
    expect(existsSync(scanPath(file))).toBe(false);
    expect(existsSync(scanPath(invoiceFile))).toBe(false);
    expect(await AuditLog.countDocuments({ action: 'TU_PAYMENT_DELETED' })).toBe(1);
    expect((await remove(1)).status).toBe(404);
  });

  it('freezes with cancelled technical conditions, still open to read and to delete', async () => {
    await save();
    await upload('act', 'акт');
    await request(app)
      .post(`${tuUrl()}/${tuId}/cancel`)
      .set(owner.auth)
      .send({ version: 1, reason: 'Помилка' });

    expect((await save({ version: 1, paidDate: '2026-11-18' })).body.error.code).toBe(
      'DOCUMENT_CANCELLED',
    );
    expect((await upload('receipt', 'квитанція')).body.error.code).toBe('DOCUMENT_CANCELLED');
    expect((await request(app).get(url('/scans/act')).set(owner.auth)).status).toBe(200);
    expect((await remove(1)).status).toBe(200);
  });

  it('shows in the timeline after its technical conditions', async () => {
    await save({ paidDate: '2026-11-18', actTransferMonth: '2026-11' });
    await upload('receipt', 'квитанція');

    const { body } = await request(app)
      .get(`${APPLICATIONS}/${applicationId}/processing`)
      .set(owner.auth);

    expect(body.events.map((e: { type: string; date: string }) => `${e.type} ${e.date}`)).toEqual([
      'REGISTERED 2026-11-02',
      'TECHNICAL_CONDITIONS 2026-11-16',
      'TU_INVOICE 2026-11-17',
      'TU_PAID 2026-11-18',
      // A month: placed after the payment made that month.
      'TU_ACT_TRANSFERRED 2026-11-18',
    ]);
    expect(body.events[4].month).toBe('2026-11');
    expect(body.events[2]).toMatchObject({ number: '125/Б', documentId: tuId });
    expect(body.events[3].scanName).toBe('квитанція.pdf');
  });

  it('goes with its application, files included', async () => {
    await save();
    await upload('act', 'акт');
    await upload('invoice', 'рахунок');
    const stored = (await TuPayment.findOne().lean())!;
    const file = stored.actScan!.fileId;
    const invoiceFile = stored.invoiceScan!.fileId;
    const version = (await request(app).get(`${APPLICATIONS}/${applicationId}`).set(admin.auth))
      .body.version as number;

    await request(app)
      .delete(`${APPLICATIONS}/${applicationId}`)
      .query({ version })
      .set(admin.auth);

    expect(await TuPayment.countDocuments()).toBe(0);
    expect(existsSync(scanPath(file))).toBe(false);
    expect(existsSync(scanPath(invoiceFile))).toBe(false);
  });

  it('turns an act transfer date entered before into its month, once', async () => {
    await save({ paidDate: '2026-11-18' });
    await TuPayment.collection.updateOne(
      {},
      {
        $set: { actTransferredDate: new Date('2026-11-19T00:00:00Z') },
        $unset: { actTransferMonth: '' },
      },
    );

    expect(await moveActTransferDateToMonth()).toBe(1);
    expect(await moveActTransferDateToMonth()).toBe(0);
    const stored = await TuPayment.collection.findOne({});
    expect(stored).toMatchObject({ actTransferMonth: '2026-11' });
    expect(stored).not.toHaveProperty('actTransferredDate');
  });
  it('offers the department’s next contract number and keeps it only with its date', async () => {
    const docx = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.from('договір')]);
    const nextNumber = async (who = owner, path = url('/next-contract-number')) =>
      (await request(app).get(path).set(who.auth)).body.contractNumber;
    expect(await nextNumber()).toBe(1);

    // A number without its date is not kept: no contract takes no number.
    expect((await save({ contractNumber: '1' })).body.payment.contractNumber).toBeNull();
    const saved = await save({ version: 1, contractNumber: '1', contractDate: '2026-11-18' });
    expect(saved.body.payment).toMatchObject({ contractNumber: 1, contractDate: '2026-11-18' });
    // The payment's own number stays offered to it.
    expect(await nextNumber()).toBe(1);

    // Another application of the department gets the next one; the same number is refused.
    const other = (await registerApplication(app, owner)).id;
    const engineer = (await Engineer.findOne().lean())!;
    const otherTu = await request(app)
      .post(`${APPLICATIONS}/${other}/technical-conditions`)
      .set(owner.auth)
      .send({
        tuNumber: '0033/ТУ',
        // Registered today (20.11): its TU are dated today too.
        preparedDate: '2026-11-20',
        engineer: String(engineer._id),
        gasFlow: '2,5',
        connectionType: 'STANDARD',
        gasPressure: 'LOW',
        connectionPoint: 'UNDERGROUND',
      });
    const otherUrl = `${APPLICATIONS}/${other}/technical-conditions/${otherTu.body.id}/payment`;
    expect(await nextNumber(owner, `${otherUrl}/next-contract-number`)).toBe(2);
    const taken = await request(app)
      .put(otherUrl)
      .set(owner.auth)
      .send({
        ...invoice,
        invoiceDate: '2026-11-20',
        contractNumber: 1,
        contractDate: '2026-11-20',
      });
    expect(taken.status).toBe(409);
    expect(taken.body.error.details.fieldErrors.contractNumber).toEqual([
      'Договір № 1 уже є в цьому управлінні',
    ]);

    // The contract as a Word document and the signed one's scan.
    const word = await request(app)
      .put(url('/scans/contractDocument'))
      .set(owner.auth)
      .attach('document', docx, {
        filename: 'Договір 1.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    expect(word.body.payment.contractDocument).toMatchObject({ name: 'Договір 1.docx' });
    expect((await upload('contract', 'підписаний')).body.payment.contractScan).toMatchObject({
      name: 'підписаний.pdf',
    });
    const download = await request(app).get(url('/scans/contractDocument')).set(owner.auth);
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
    const stored = (await TuPayment.findOne({ contractNumber: 1 }).lean())!;
    expect(existsSync(scanPath(stored.contractDocument!.fileId, 'docx'))).toBe(true);

    // Deleted with its files, the Word document included.
    expect((await request(app).delete(url()).query({ version: 2 }).set(admin.auth)).status).toBe(
      200,
    );
    expect(existsSync(scanPath(stored.contractDocument!.fileId, 'docx'))).toBe(false);
    expect(existsSync(scanPath(stored.contractScan!.fileId))).toBe(false);
  });
});
