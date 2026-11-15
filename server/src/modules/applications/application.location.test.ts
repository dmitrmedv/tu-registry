import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import {
  APPLICATIONS,
  type ApiSession,
  applicationFields,
  registerApplication,
  signedInWithAuth,
} from '../../test/applications';
import { useTestDb } from '../../test/db';
import { backfillSettlement, splitSettlement } from './application.migration';
import { Application } from './application.model';
import { ApplicationChange } from './applicationChange.model';

const app = createApp();
const CADASTRAL = '3220481301:01:007:0012';

describe('settlement and cadastral number', () => {
  useTestDb();

  let user: ApiSession;
  beforeEach(async () => {
    user = await signedInWithAuth(app);
  });

  const list = (query: Record<string, string>) =>
    request(app).get(APPLICATIONS).query(query).set(user.auth);

  it('stores both and returns them in the card and the registry', async () => {
    const created = await registerApplication(app, user, {
      ...applicationFields,
      cadastralNumber: CADASTRAL,
    });

    expect(created).toMatchObject({ settlement: 'м. Київ', cadastralNumber: CADASTRAL });
    expect((await list({})).body.data[0]).toMatchObject({
      settlement: 'м. Київ',
      objectAddress: 'вул. Прикладна, 1',
      cadastralNumber: CADASTRAL,
    });
  });

  it('requires the settlement and a well-formed cadastral number', async () => {
    const { settlement: _omitted, ...withoutSettlement } = applicationFields;
    const missing = await request(app).post(APPLICATIONS).set(user.auth).send(withoutSettlement);
    expect(missing.body.error.details.fieldErrors.settlement).toBeDefined();

    const malformed = await request(app)
      .post(APPLICATIONS)
      .set(user.auth)
      .send({ ...applicationFields, cadastralNumber: '12345' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.details.fieldErrors.cadastralNumber).toBeDefined();
  });

  it('searches the settlement, and the street or the cadastral number in one field', async () => {
    await registerApplication(app, user, {
      ...applicationFields,
      settlement: 'м. Бровари',
      objectAddress: 'вул. Садова, 3',
      cadastralNumber: CADASTRAL,
    });
    await registerApplication(app, user, {
      ...applicationFields,
      customer: 'ФОП Інший',
      objectAddress: 'просп. Перемоги, 7',
    });

    expect((await list({ settlement: 'бровар' })).body.meta.total).toBe(1);
    expect((await list({ address: 'садова' })).body.meta.total).toBe(1);
    expect((await list({ address: '01:007' })).body.meta.total).toBe(1);
    expect((await list({ address: 'перемоги' })).body.data[0].customer).toBe('ФОП Інший');
    // The address search combines with the other filters (AND), not replaces them.
    expect((await list({ address: 'садова', customer: 'Інший' })).body.meta.total).toBe(0);
  });

  it('records changes in the history and clears the cadastral number with ""', async () => {
    const created = await registerApplication(app, user, {
      ...applicationFields,
      cadastralNumber: CADASTRAL,
    });

    const res = await request(app)
      .patch(`${APPLICATIONS}/${created.id}`)
      .set(user.auth)
      .send({ settlement: 'м. Ірпінь', cadastralNumber: '', version: 1 });

    expect(res.body).toMatchObject({ settlement: 'м. Ірпінь', cadastralNumber: null });
    const change = await ApplicationChange.findOne({ action: 'UPDATED' }).lean();
    expect(change!.changes).toEqual([
      { field: 'settlement', oldValue: 'м. Київ', newValue: 'м. Ірпінь' },
      { field: 'cadastralNumber', oldValue: CADASTRAL, newValue: null },
    ]);
  });

  describe('records from before the settlement field', () => {
    it.each([
      ['м. Київ, вул. Шевченка, 1', 'м. Київ', 'вул. Шевченка, 1'],
      ['с. Велика Димерка, вул. Центральна, 125', 'с. Велика Димерка', 'вул. Центральна, 125'],
      ['смт Гостомель, вул. Мира, 2', 'смт Гостомель', 'вул. Мира, 2'],
      ['  сел. Козин ,  пров. Тихий, 4 ', 'сел. Козин', 'пров. Тихий, 4'],
    ])('splits %j', (address, settlement, objectAddress) => {
      expect(splitSettlement(address)).toEqual({ settlement, objectAddress });
    });

    it.each([
      'Київська обл., Броварський р-н, с. Велика Димерка',
      'вул. Шевченка, 1',
      'м. Київ',
      'місто без крапки',
    ])('leaves %j unchanged', (address) => {
      expect(splitSettlement(address)).toBeNull();
    });

    it('moves the settlement out of the address once, leaving others as they were', async () => {
      const legacy = (objectAddress: string) => ({
        ...applicationFields,
        phone: '+380671234567',
        settlement: undefined,
        objectAddress,
        regYear: 2025,
        regDate: new Date('2025-05-01T00:00:00Z'),
        registrationMode: 'MANUAL',
        createdBy: user.user.id,
      });
      const [splittable, unclear] = await Application.insertMany([
        { ...legacy('м. Київ, вул. Шевченка, 1'), regSeq: 1 },
        { ...legacy('Київська обл., Броварський р-н'), regSeq: 2 },
      ]);
      const current = await registerApplication(app, user);

      expect(await backfillSettlement()).toBe(1);
      expect(await backfillSettlement()).toBe(0);

      expect(await Application.findById(splittable!._id).lean()).toMatchObject({
        settlement: 'м. Київ',
        objectAddress: 'вул. Шевченка, 1',
      });
      const untouched = await Application.findById(unclear!._id).lean();
      expect(untouched!.settlement).toBeUndefined();
      expect(untouched!.objectAddress).toBe('Київська обл., Броварський р-н');
      expect((await Application.findById(current.id).lean())!.objectAddress).toBe(
        'вул. Прикладна, 1',
      );
    });
  });
});
