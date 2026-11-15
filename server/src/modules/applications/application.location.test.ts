import { Types } from 'mongoose';
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
import { allModels } from '../../models';
import {
  areaTypeOf,
  backfillAreaType,
  backfillSettlement,
  moveCadastralNumberIntoAddress,
  splitSettlement,
} from './application.migration';
import { Application } from './application.model';
import { buildListFilter, listSort } from './application.query';
import { ApplicationChange } from './applicationChange.model';

const app = createApp();

describe('settlement, area type and the registry search and sort', () => {
  useTestDb();

  let user: ApiSession;
  beforeEach(async () => {
    user = await signedInWithAuth(app, { login: 'olena' });
  });

  const list = (query: Record<string, string>) =>
    request(app).get(APPLICATIONS).query(query).set(user.auth);
  const customers = async (query: Record<string, string>) =>
    ((await list(query)).body.data as { customer: string }[]).map((row) => row.customer);
  const register = (overrides: Record<string, unknown>) =>
    registerApplication(app, user, { ...applicationFields, ...overrides });

  it('stores the settlement and the area type and returns them everywhere', async () => {
    const created = await register({ settlement: 'с. Гора', areaType: 'RURAL' });

    expect(created).toMatchObject({ settlement: 'с. Гора', areaType: 'RURAL' });
    expect((await list({})).body.data[0]).toMatchObject({
      settlement: 'с. Гора',
      areaType: 'RURAL',
    });
  });

  it('requires both', async () => {
    const { settlement: _s, areaType: _a, ...without } = applicationFields;
    const res = await request(app).post(APPLICATIONS).set(user.auth).send(without);
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(
      expect.arrayContaining(['settlement', 'areaType']),
    );
  });

  it('searches settlement, address, representative and comment; filters by area', async () => {
    await register({
      customer: 'А',
      settlement: 'м. Бровари',
      objectAddress: 'вул. Садова, 3',
      customerRepresentative: 'Петренко Іван',
      comment: 'Довідка буде пізніше',
    });
    await register({
      customer: 'Б',
      settlement: 'с. Гора',
      areaType: 'RURAL',
      customerRepresentative: 'Коваль Олена',
    });

    expect(await customers({ settlement: 'бровар' })).toEqual(['А']);
    expect(await customers({ address: 'садова' })).toEqual(['А']);
    expect(await customers({ customerRepresentative: 'петренко' })).toEqual(['А']);
    expect(await customers({ comment: 'довідка' })).toEqual(['А']);
    expect(await customers({ areaType: 'RURAL' })).toEqual(['Б']);
    expect(await customers({ comment: 'довідка', areaType: 'RURAL' })).toEqual([]);
  });

  it('records area changes in the history', async () => {
    const created = await register({});

    await request(app)
      .patch(`${APPLICATIONS}/${created.id}`)
      .set(user.auth)
      .send({ areaType: 'RURAL', version: 1 });

    const change = await ApplicationChange.findOne({ action: 'UPDATED' }).lean();
    expect(change!.changes).toEqual([{ field: 'areaType', oldValue: 'URBAN', newValue: 'RURAL' }]);
  });

  describe('sorting', () => {
    it('sorts text in Ukrainian alphabetical order, with the number breaking ties', async () => {
      // Є, І, Ї, Ґ come before А in plain code-point order; the Ukrainian alphabet differs.
      for (const customer of ['Їжак', 'Ґудзик', 'Євро', 'Іванов', 'Гарбуз', 'Еко', 'Гарбуз']) {
        await register({ customer });
      }

      expect(await customers({ sort: 'customer' })).toEqual([
        'Гарбуз',
        'Гарбуз',
        'Ґудзик',
        'Еко',
        'Євро',
        'Іванов',
        'Їжак',
      ]);
      const desc = (await list({ sort: '-customer' })).body.data as { regSeq: number }[];
      // Equal names: the higher number first, like everything else in a descending sort.
      expect(desc.slice(-2).map((row) => row.regSeq)).toEqual([7, 5]);
    });

    it('sorts type, category and area by their names, not their codes', async () => {
      await register({ customer: 'квартира', objectCategory: 'APARTMENT' });
      await register({ customer: 'біогаз', objectCategory: 'BIOGAS_PRODUCER' });
      await register({ customer: 'інше', objectCategory: 'OTHER', objectCategoryOther: 'Я' });
      await register({ customer: 'сільська', areaType: 'RURAL', objectType: 'NON_DOMESTIC' });

      expect(await customers({ sort: 'objectCategory', limit: '10' })).toEqual([
        'біогаз', // Виробник біогазу
        'сільська', // Житловий будинок
        'інше', // Інше (whatever the wording)
        'квартира', // Квартира
      ]);
      // Міська < Сільська; Непобутовий < Побутовий.
      expect((await customers({ sort: '-areaType' }))[0]).toBe('сільська');
      expect((await customers({ sort: 'objectType' }))[0]).toBe('сільська');
    });

    it('sorts by the name of who registered, and keeps paging consistent', async () => {
      const colleague = await signedInWithAuth(app, { login: 'andriy' });
      await colleague.user.updateOne({ fullName: 'Андрій Бойко' });
      await user.user.updateOne({ fullName: 'Ярослав Ткач' });
      await register({ customer: 'від Ярослава' });
      await registerApplication(app, colleague, { ...applicationFields, customer: 'від Андрія' });
      await register({ customer: 'ще від Ярослава' });

      expect(await customers({ sort: 'createdBy' })).toEqual([
        'від Андрія',
        'від Ярослава',
        'ще від Ярослава',
      ]);
      const secondPage = await list({ sort: 'createdBy', page: '2', limit: '10' });
      expect(secondPage.body).toMatchObject({ data: [], meta: { total: 3 } });
    });

    it('uses an index for every text and date sort instead of sorting in memory', async () => {
      await Promise.all(allModels.map((model) => model.syncIndexes()));
      // An admin's "all departments" view, and a user's (always one department).
      for (const department of [undefined, 'ODESA' as const]) {
        const filter = buildListFilter({ page: 1, limit: 20, sort: 'customer', department });
        for (const field of [
          'regNumber',
          'regDate',
          'customer',
          'settlement',
          'objectAddress',
          'customerRepresentative',
        ]) {
          for (const sort of [field, `-${field}`] as const) {
            const plan = listSort(sort as 'customer');
            if (plan.kind !== 'indexed') throw new Error(`${sort} is expected to use an index`);
            const query = Application.find(filter).sort(plan.sort);
            if (plan.collation) query.collation(plan.collation);
            // The plan MongoDB picked; rejected alternatives may well contain a SORT stage.
            const explained = JSON.stringify(
              (
                (await query.explain('queryPlanner')) as unknown as {
                  queryPlanner: { winningPlan: unknown };
                }
              ).queryPlanner.winningPlan,
            );
            expect(explained, `${sort} ${department}`).toContain('IXSCAN');
            expect(explained, `${sort} ${department}`).not.toContain('"stage":"SORT"');
          }
        }
      }
    });
  });

  describe('records from before stage 12', () => {
    it.each([
      ['м. Київ', 'URBAN'],
      ['смт Гостомель', 'URBAN'],
      ['с. Гора', 'RURAL'],
      ['сел. Козин', 'RURAL'],
      ['с-ще Слобожанське', 'RURAL'],
      ['селище Ворзель', 'RURAL'],
      ['Київ', null],
    ])('%s → %s', (settlement, areaType) => {
      expect(areaTypeOf(settlement)).toBe(areaType);
    });

    async function insertLegacy(fields: Record<string, unknown>) {
      const { insertedId } = await Application.collection.insertOne({
        regYear: 2025,
        regSeq: Math.floor(Math.random() * 1e6) + 1,
        regDate: new Date('2025-05-01T00:00:00Z'),
        customer: 'ТОВ «Старе»',
        phone: '+380671234567',
        objectType: 'DOMESTIC',
        objectCategory: 'OTHER',
        registrationMode: 'MANUAL',
        status: 'ACTIVE',
        createdBy: new Types.ObjectId(user.user.id),
        version: 1,
        ...fields,
      });
      return insertedId;
    }

    it('moves cadastral numbers into the address once; a too long address is left alone', async () => {
      const short = await insertLegacy({
        objectAddress: 'вул. Шевченка, 1',
        cadastralNumber: '3220481301:01:007:0012',
      });
      const long = await insertLegacy({
        objectAddress: 'а'.repeat(480),
        cadastralNumber: '3220481301:01:007:0013',
      });

      expect(await moveCadastralNumberIntoAddress()).toEqual({ moved: 1, skipped: [String(long)] });
      expect(await moveCadastralNumberIntoAddress()).toEqual({ moved: 0, skipped: [String(long)] });

      const moved = await Application.collection.findOne({ _id: short });
      expect(moved).toMatchObject({
        objectAddress: 'вул. Шевченка, 1; кад. № 3220481301:01:007:0012',
      });
      expect(moved).not.toHaveProperty('cadastralNumber');
      expect(await Application.collection.findOne({ _id: long })).toHaveProperty('cadastralNumber');
    });

    it('derives the area type from the settlement once, after the settlement is split', async () => {
      const village = await insertLegacy({ objectAddress: 'с. Гора, вул. Лісова, 2' });
      const unclear = await insertLegacy({ objectAddress: 'Броварський р-н, вул. Лісова, 2' });
      const current = await register({ settlement: 'с. Гора', areaType: 'URBAN' });

      await backfillSettlement();
      expect(await backfillAreaType()).toBe(1);
      expect(await backfillAreaType()).toBe(0);

      expect(await Application.collection.findOne({ _id: village })).toMatchObject({
        settlement: 'с. Гора',
        areaType: 'RURAL',
      });
      expect(await Application.collection.findOne({ _id: unclear })).not.toHaveProperty('areaType');
      // Set by a person: never overwritten.
      expect((await Application.findById(current.id).lean())!.areaType).toBe('URBAN');
    });

    it.each([
      ['м. Київ, вул. Шевченка, 1', 'м. Київ', 'вул. Шевченка, 1'],
      ['  сел. Козин ,  пров. Тихий, 4 ', 'сел. Козин', 'пров. Тихий, 4'],
    ])('still splits the settlement out of %j', (address, settlement, objectAddress) => {
      expect(splitSettlement(address)).toEqual({ settlement, objectAddress });
    });
  });
});
