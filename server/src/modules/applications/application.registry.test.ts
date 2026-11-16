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
import { Engineer } from '../engineers/engineer.model';
import { Application } from './application.model';

const app = createApp();

/** The registry with the processing of applications (stage 17.6). */
describe('registry: stage, documents, engineers', () => {
  useTestDb();

  let owner: ApiSession;
  let reni: ApiSession;
  let admin: ApiSession;
  let boiko: string;
  let tkach: string;
  // Registered 02.11 one by one; each gets its documents below.
  let ids: Record<'plain' | 'answered' | 'resumed' | 'prepared' | 'annulled', string>;

  beforeEach(async () => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-02T09:00:00Z'));
    owner = await signedInWithAuth(app, { login: 'owner' });
    reni = await signedInWithAuth(app, { login: 'reni', department: 'RENI' });
    admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
    const engineer = async (fullName: string) =>
      String(
        (await Engineer.create({ fullName, department: 'ODESA', createdBy: admin.user._id }))._id,
      );
    boiko = await engineer('Бойко Андрій');
    tkach = await engineer('Ткач Ярослав');
    const register = async (customer: string) =>
      (await registerApplication(app, owner, { ...applicationFields, customer })).id;
    ids = {
      plain: await register('Без документів'),
      answered: await register('З відповіддю'),
      resumed: await register('Документи надійшли'),
      prepared: await register('З ТУ'),
      annulled: await register('Анульована'),
    };
    vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-20T09:00:00Z'));

    const respond = (id: string, outgoingNumber: string, responseDate: string, engineer = boiko) =>
      request(app)
        .post(`${APPLICATIONS}/${id}/responses`)
        .set(owner.auth)
        .send({ outgoingNumber, responseDate, engineer });
    await respond(ids.answered, '125/01-15', '2026-11-04', tkach);
    const resumed = await respond(ids.resumed, '130/01-15', '2026-11-05');
    await request(app)
      .patch(`${APPLICATIONS}/${ids.resumed}/responses/${resumed.body.id}`)
      .set(owner.auth)
      .send({ version: 1, documentsReceivedAt: '2026-11-06' });
    await prepareTu(ids.prepared, '0032/ТУ', '2026-11-12', 2.5, 'STANDARD');
    await request(app)
      .post(`${APPLICATIONS}/${ids.annulled}/annul`)
      .set(owner.auth)
      .send({ reason: 'Відкликано', version: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function prepareTu(
    id: string,
    tuNumber: string,
    preparedDate: string,
    gasFlow: number,
    connectionType: string,
    engineer = boiko,
  ) {
    return request(app).post(`${APPLICATIONS}/${id}/technical-conditions`).set(owner.auth).send({
      tuNumber,
      preparedDate,
      engineer,
      gasFlow,
      connectionType,
      gasPressure: 'LOW',
      connectionPoint: 'UNDERGROUND',
    });
  }
  const rows = async (query: Record<string, string>, who = owner) =>
    (
      await request(app)
        .get(APPLICATIONS)
        .query({ limit: '50', ...query })
        .set(who.auth)
    ).body.data as Record<string, unknown>[];
  const customers = async (query: Record<string, string>, who = owner) =>
    (await rows(query, who)).map((row) => row.customer);

  it('shows the stage and the documents of each application in its row', async () => {
    const byCustomer = Object.fromEntries((await rows({})).map((row) => [row.customer, row]));

    expect(byCustomer['Без документів']).toMatchObject({
      stage: 'REGISTERED',
      lastResponseDate: null,
      tuNumber: null,
      engineerName: null,
    });
    expect(byCustomer['З відповіддю']).toMatchObject({
      stage: 'RESPONDED',
      lastResponseDate: '2026-11-04',
      lastResponseNumber: '125/01-15',
      engineerName: 'Ткач Ярослав',
    });
    expect(byCustomer['Документи надійшли']).toMatchObject({ stage: 'IN_PROGRESS' });
    expect(byCustomer['З ТУ']).toMatchObject({
      stage: 'TU_PREPARED',
      tuDate: '2026-11-12',
      tuNumber: '0032/ТУ',
      gasFlow: 2.5,
      connectionType: 'STANDARD',
      engineerName: 'Бойко Андрій',
    });
    expect(byCustomer['Анульована']).toMatchObject({ status: 'ANNULLED' });
  });

  it('filters by «Стан», counting an application without a summary as registered', async () => {
    await Application.updateOne({ _id: ids.plain }, { $unset: { processing: 1 } });

    expect(await customers({ stage: 'REGISTERED' })).toEqual(['Без документів']);
    expect(await customers({ stage: 'RESPONDED' })).toEqual(['З відповіддю']);
    expect(await customers({ stage: 'IN_PROGRESS' })).toEqual(['Документи надійшли']);
    expect(await customers({ stage: 'TU_PREPARED' })).toEqual(['З ТУ']);
    expect(await customers({ stage: 'ANNULLED' })).toEqual(['Анульована']);
    expect(
      (await request(app).get(APPLICATIONS).query({ stage: 'DONE' }).set(owner.auth)).status,
    ).toBe(400);
  });

  it('filters by engineer of any document in force', async () => {
    expect((await customers({ engineer: boiko, sort: 'customer' })).sort()).toEqual([
      'Документи надійшли',
      'З ТУ',
    ]);
    expect(await customers({ engineer: tkach })).toEqual(['З відповіддю']);

    // Cancelled technical conditions no longer name their engineer.
    const tu = (
      await request(app).get(`${APPLICATIONS}/${ids.prepared}/technical-conditions`).set(owner.auth)
    ).body[0];
    await request(app)
      .post(`${APPLICATIONS}/${ids.prepared}/technical-conditions/${tu.id}/cancel`)
      .set(owner.auth)
      .send({ version: 1, reason: 'Помилка' });
    expect(await customers({ engineer: boiko })).toEqual(['Документи надійшли']);
  });

  it('finds by a TU or response number in the search box, not by cancelled ones', async () => {
    expect(await customers({ q: '0032/ту' })).toEqual(['З ТУ']);
    expect(await customers({ q: '125/01' })).toEqual(['З відповіддю']);

    const tu = (
      await request(app).get(`${APPLICATIONS}/${ids.prepared}/technical-conditions`).set(owner.auth)
    ).body[0];
    await request(app)
      .post(`${APPLICATIONS}/${ids.prepared}/technical-conditions/${tu.id}/cancel`)
      .set(owner.auth)
      .send({ version: 1, reason: 'Помилка' });
    expect(await customers({ q: '0032/ту' })).toEqual([]);
  });

  it('sorts by the response date and the TU date, the ones without at the end going up', async () => {
    await prepareTu(ids.answered, '0040/ТУ', '2026-11-10', 12, 'RECONSTRUCTION', tkach);

    expect((await customers({ sort: 'tuDate' })).slice(-2)).toEqual(['З відповіддю', 'З ТУ']);
    expect((await customers({ sort: '-tuDate' })).slice(0, 2)).toEqual(['З ТУ', 'З відповіддю']);
    expect((await customers({ sort: '-lastResponseDate' })).slice(0, 2)).toEqual([
      'Документи надійшли',
      'З відповіддю',
    ]);
  });

  it('sorts by stage name, document numbers, gas flow, connection type and engineer', async () => {
    await prepareTu(ids.answered, '0040/ТУ', '2026-11-10', 12, 'RECONSTRUCTION', tkach);

    // Анульована < Документи… (На опрацюванні) < Зареєстрована < ТУ підготовлені (×2).
    expect(await customers({ sort: 'stage' })).toEqual([
      'Анульована',
      'Без документів',
      'Документи надійшли',
      'З відповіддю',
      'З ТУ',
    ]);
    const withTu = (list: unknown[]) => list.filter((c) => c === 'З ТУ' || c === 'З відповіддю');
    expect(withTu(await customers({ sort: '-gasFlow' }))).toEqual(['З відповіддю', 'З ТУ']);
    expect(withTu(await customers({ sort: '-tuNumber' }))).toEqual(['З відповіддю', 'З ТУ']);
    // Реконструкція < Стандартне.
    expect(withTu(await customers({ sort: '-connectionType' }))).toEqual(['З ТУ', 'З відповіддю']);
    expect(withTu(await customers({ sort: 'engineer' }))).toEqual(['З ТУ', 'З відповіддю']);
    expect(
      (await request(app).get(APPLICATIONS).query({ sort: '-lastResponseNumber' }).set(owner.auth))
        .status,
    ).toBe(200);
  });

  it('keeps a user in their department whatever they filter by', async () => {
    expect(await customers({ engineer: boiko }, reni)).toEqual([]);
    expect(await customers({ stage: 'TU_PREPARED' }, reni)).toEqual([]);
    expect(await customers({ q: '0032' }, reni)).toEqual([]);
    expect(await customers({ stage: 'TU_PREPARED' }, admin)).toEqual(['З ТУ']);
  });
});
