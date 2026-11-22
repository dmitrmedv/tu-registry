import type { ApplicationChangeDto } from '@tu-registry/shared';
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

const app = createApp();
const pdf = Buffer.from('%PDF-1.4\n% history\n%%EOF\n');

/**
 * «Історія змін» of the card: every change of the application's documents is there, not only
 * of its own fields (2026-11-19). A new module of the card adds its case here.
 */
describe('history of an application: its documents too', () => {
  useTestDb();

  let owner: ApiSession;
  let admin: ApiSession;
  let applicationId: string;
  let engineerId: string;

  beforeEach(async () => {
    const now = vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-02T09:00:00Z'));
    owner = await signedInWithAuth(app, { login: 'owner' });
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

  const base = () => `${APPLICATIONS}/${applicationId}`;
  /** The history without the application's own registration, oldest first. */
  const documentHistory = async () => {
    const { body } = await request(app).get(`${base()}/history`).set(owner.auth);
    return (body as ApplicationChangeDto[])
      .filter((entry) => entry.document)
      .reverse()
      .map(({ action, document, changes, changedBy }) => ({
        action,
        document: `${document!.kind} ${document!.number}`,
        changes,
        by: changedBy.fullName,
      }));
  };
  const attach = (path: string) =>
    request(app)
      .put(`${base()}${path}`)
      .set(owner.auth)
      .attach('scan', pdf, { filename: 'скан.pdf', contentType: 'application/pdf' });

  it('records a response: added, renumbered, its scan, cancelled, restored, deleted', async () => {
    const created = await request(app)
      .post(`${base()}/responses`)
      .set(owner.auth)
      .send({ outgoingNumber: '125/01', responseDate: '2026-11-10', engineer: engineerId });
    const url = `/responses/${created.body.id}`;
    await request(app)
      .patch(`${base()}${url}`)
      .set(owner.auth)
      .send({ version: 1, outgoingNumber: '126/01' });
    await attach(`${url}/scan`);
    await request(app).delete(`${base()}${url}/scan`).set(owner.auth);
    await request(app)
      .post(`${base()}${url}/cancel`)
      .set(owner.auth)
      .send({ version: 2, reason: 'Помилково внесено' });
    await request(app).post(`${base()}${url}/restore`).set(admin.auth).send({ version: 3 });
    await request(app).delete(`${base()}${url}`).query({ version: 4 }).set(admin.auth);

    expect(await documentHistory()).toEqual([
      { action: 'CREATED', document: 'RESPONSE 125/01', changes: [], by: owner.user.fullName },
      {
        action: 'UPDATED',
        document: 'RESPONSE 126/01',
        changes: [{ field: 'outgoingNumber', oldValue: '125/01', newValue: '126/01' }],
        by: owner.user.fullName,
      },
      {
        action: 'UPDATED',
        document: 'RESPONSE 126/01',
        changes: [{ field: 'scan', oldValue: null, newValue: 'новий файл' }],
        by: owner.user.fullName,
      },
      {
        action: 'UPDATED',
        document: 'RESPONSE 126/01',
        changes: [{ field: 'scan', oldValue: 'файл', newValue: null }],
        by: owner.user.fullName,
      },
      { action: 'CANCELLED', document: 'RESPONSE 126/01', changes: [], by: owner.user.fullName },
      { action: 'RESTORED', document: 'RESPONSE 126/01', changes: [], by: admin.user.fullName },
      { action: 'DELETED', document: 'RESPONSE 126/01', changes: [], by: admin.user.fullName },
    ]);
  });

  it('records technical conditions, deleted too, with the customer’s values the audit never gets', async () => {
    const created = await request(app).post(`${base()}/technical-conditions`).set(owner.auth).send({
      tuNumber: '0032/ТУ',
      preparedDate: '2026-11-16',
      engineer: engineerId,
      gasFlow: '2,5',
      connectionType: 'STANDARD',
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
    });
    const url = `/technical-conditions/${created.body.id}`;
    await request(app)
      .patch(`${base()}${url}`)
      .set(owner.auth)
      .send({ version: 1, tuNumber: '0033/ТУ', customer: 'ТОВ «Нова назва»' });
    await attach(`${url}/scan`);
    await request(app)
      .post(`${base()}${url}/cancel`)
      .set(owner.auth)
      .send({ version: 2, reason: 'Замінено' });
    await request(app).delete(`${base()}${url}`).query({ version: 3 }).set(admin.auth);

    expect(await documentHistory()).toEqual([
      expect.objectContaining({ action: 'CREATED', document: 'TECHNICAL_CONDITIONS 0032/ТУ' }),
      expect.objectContaining({
        action: 'UPDATED',
        document: 'TECHNICAL_CONDITIONS 0033/ТУ',
        changes: [
          { field: 'customer', oldValue: created.body.customer, newValue: 'ТОВ «Нова назва»' },
          { field: 'tuNumber', oldValue: '0032/ТУ', newValue: '0033/ТУ' },
        ],
      }),
      expect.objectContaining({
        document: 'TECHNICAL_CONDITIONS 0033/ТУ',
        changes: [{ field: 'scan', oldValue: null, newValue: 'новий файл' }],
      }),
      expect.objectContaining({ action: 'CANCELLED', document: 'TECHNICAL_CONDITIONS 0033/ТУ' }),
      expect.objectContaining({ action: 'DELETED', document: 'TECHNICAL_CONDITIONS 0033/ТУ' }),
    ]);
    const audited = await AuditLog.findOne({ action: 'TU_UPDATED' }).lean();
    expect(audited!.details.changes).toEqual([
      { field: 'customer' },
      { field: 'tuNumber', from: '0032/ТУ', to: '0033/ТУ' },
    ]);
  });

  it('records the payment for technical conditions: invoice, changes, scans, deletion', async () => {
    const tu = await request(app).post(`${base()}/technical-conditions`).set(owner.auth).send({
      tuNumber: '0032/ТУ',
      preparedDate: '2026-11-16',
      engineer: engineerId,
      gasFlow: '2,5',
      connectionType: 'STANDARD',
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
    });
    const url = `/technical-conditions/${tu.body.id}/payment`;
    const invoice = { invoiceNumber: '125/Б', invoiceDate: '2026-11-17', amount: '2750' };
    await request(app).put(`${base()}${url}`).set(owner.auth).send(invoice);
    await request(app)
      .put(`${base()}${url}`)
      .set(owner.auth)
      .send({ ...invoice, version: 1, invoiceNumber: '126/Б', paidDate: '2026-11-18' });
    await attach(`${url}/scans/receipt`);
    await request(app).delete(`${base()}${url}`).query({ version: 2 }).set(admin.auth);

    const payment = (await documentHistory()).filter((entry) =>
      entry.document.startsWith('TU_PAYMENT'),
    );
    expect(payment).toEqual([
      expect.objectContaining({ action: 'CREATED', document: 'TU_PAYMENT 125/Б' }),
      expect.objectContaining({
        action: 'UPDATED',
        document: 'TU_PAYMENT 126/Б',
        changes: [
          { field: 'invoiceNumber', oldValue: '125/Б', newValue: '126/Б' },
          { field: 'paidDate', oldValue: null, newValue: '2026-11-18' },
        ],
      }),
      expect.objectContaining({
        document: 'TU_PAYMENT 126/Б',
        changes: [{ field: 'receiptScan', oldValue: null, newValue: 'новий файл' }],
      }),
      expect.objectContaining({ action: 'DELETED', document: 'TU_PAYMENT 126/Б' }),
    ]);
  });
  it('records an estimate: added, changed, its scan, recalculated, deleted', async () => {
    await request(app).post(`${base()}/technical-conditions`).set(owner.auth).send({
      tuNumber: '0032/ТУ',
      preparedDate: '2026-11-16',
      engineer: engineerId,
      gasFlow: '2,5',
      connectionType: 'STANDARD',
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
    });
    await request(app).post(`${base()}/projects`).set(owner.auth).send({
      approvalNumber: '125/П',
      approvalDate: '2026-11-18',
      designOrganization: 'ТОВ «Проєктбуд»',
    });
    const created = await request(app).post(`${base()}/estimates`).set(owner.auth).send({});
    const url = `/estimates/${created.body.id}`;
    await request(app)
      .patch(`${base()}${url}`)
      .set(owner.auth)
      .send({ version: 1, checkDate: '2026-11-19', amount: null });
    await attach(`${url}/files/scan`);
    const second = await request(app).post(`${base()}/estimates`).set(owner.auth).send({});
    await request(app)
      .delete(`${base()}/estimates/${second.body.id}`)
      .query({ version: 1 })
      .set(admin.auth);

    const estimates = (await documentHistory()).filter((entry) =>
      entry.document.startsWith('ESTIMATE'),
    );
    expect(estimates).toEqual([
      expect.objectContaining({ action: 'CREATED', document: 'ESTIMATE 125/П' }),
      expect.objectContaining({
        action: 'UPDATED',
        changes: [{ field: 'checkDate', oldValue: null, newValue: '2026-11-19' }],
      }),
      expect.objectContaining({
        changes: [{ field: 'scan', oldValue: null, newValue: 'новий файл' }],
      }),
      expect.objectContaining({
        changes: [{ field: 'superseded', oldValue: null, newValue: 'перераховано' }],
      }),
      expect.objectContaining({ action: 'CREATED' }),
      expect.objectContaining({ action: 'DELETED', document: 'ESTIMATE 125/П' }),
    ]);
  });

  it('records a contract: added, changed, its scan, cancelled, deleted', async () => {
    await request(app).post(`${base()}/technical-conditions`).set(owner.auth).send({
      tuNumber: '0032/ТУ',
      preparedDate: '2026-11-16',
      engineer: engineerId,
      gasFlow: '2,5',
      connectionType: 'STANDARD',
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
    });
    const contract = {
      contractNumber: '1-8',
      contractDate: '2026-11-16',
      department: 'ODESA',
      customer: 'Франко Іван Якович',
      address: 'м. Одеса, вул. Лесі Українки, 34',
    };
    const created = await request(app).post(`${base()}/contracts`).set(owner.auth).send(contract);
    const url = `/contracts/${created.body.id}`;
    await request(app)
      .patch(`${base()}${url}`)
      .set(owner.auth)
      .send({ ...contract, version: 1, signedDate: '2026-11-19' });
    await attach(`${url}/files/scan`);
    await request(app)
      .post(`${base()}${url}/cancel`)
      .set(owner.auth)
      .send({ version: 2, reason: 'Замінено' });
    await request(app).delete(`${base()}${url}`).query({ version: 3 }).set(admin.auth);

    const contracts = (await documentHistory()).filter((entry) =>
      entry.document.startsWith('CONTRACT'),
    );
    expect(contracts).toEqual([
      expect.objectContaining({ action: 'CREATED', document: 'CONTRACT 1-8' }),
      expect.objectContaining({
        action: 'UPDATED',
        changes: [{ field: 'signedDate', oldValue: null, newValue: '2026-11-19' }],
      }),
      expect.objectContaining({
        changes: [{ field: 'scan', oldValue: null, newValue: 'новий файл' }],
      }),
      expect.objectContaining({ action: 'CANCELLED', document: 'CONTRACT 1-8' }),
      expect.objectContaining({ action: 'DELETED', document: 'CONTRACT 1-8' }),
    ]);
  });
});
