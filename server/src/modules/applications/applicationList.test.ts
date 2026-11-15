import type { Types } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { signedInUser } from '../../test/auth';
import { useTestDb } from '../../test/db';
import { User } from '../users/user.model';
import { Application } from './application.model';

const app = createApp();
const LIST = '/api/v1/applications';

type Seed = Partial<{
  regYear: number;
  regSeq: number;
  regDate: string;
  customer: string;
  objectAddress: string;
  objectType: 'DOMESTIC' | 'NON_DOMESTIC';
  createdBy: Types.ObjectId;
}>;

let auth: { Authorization: string };
let me: Types.ObjectId;
let colleague: Types.ObjectId;

/** Inserts applications directly: this suite is about reading, not registering. */
async function seed(rows: Seed[]) {
  await Application.insertMany(
    rows.map((row, i) => {
      const regDate = row.regDate ?? '2026-03-01';
      return {
        regYear: row.regYear ?? Number(regDate.slice(0, 4)),
        regSeq: row.regSeq ?? i + 1,
        regDate: new Date(`${regDate}T00:00:00Z`),
        customer: row.customer ?? `Замовник ${i + 1}`,
        phone: '+380671234567',
        objectAddress: row.objectAddress ?? `вул. Тестова, ${i + 1}`,
        objectType: row.objectType ?? 'DOMESTIC',
        registrationMode: 'AUTO',
        createdBy: row.createdBy ?? me,
      };
    }),
  );
}

async function list(query: Record<string, string | number> = {}) {
  return request(app).get(LIST).query(query).set(auth);
}

const numbers = (res: { body: { data: { regNumber: string }[] } }) =>
  res.body.data.map((row) => row.regNumber);

describe('applications registry list', () => {
  useTestDb();

  beforeEach(async () => {
    const session = await signedInUser(app, { login: 'me.user' });
    auth = { Authorization: `Bearer ${session.accessToken}` };
    me = session.user._id;
    colleague = (
      await User.create({ login: 'colleague', fullName: 'Колега Іванівна', passwordHash: 'x' })
    )._id;
  });

  it('requires authentication', async () => {
    expect((await request(app).get(LIST)).status).toBe(401);
  });

  it('returns rows without contact details, with the author name and page meta', async () => {
    await seed([{ customer: 'ТОВ «Альфа»', createdBy: colleague }]);

    const res = await list();

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(res.body.data[0]).toMatchObject({
      regNumber: '1т/26',
      regDate: '2026-03-01',
      customer: 'ТОВ «Альфа»',
      customerRepresentative: null,
      createdBy: { id: String(colleague), fullName: 'Колега Іванівна' },
    });
    expect(res.body.data[0]).not.toHaveProperty('phone');
    expect(res.body.data[0]).not.toHaveProperty('email');
  });

  describe('sorting', () => {
    beforeEach(async () => {
      await seed([
        { regSeq: 9, regDate: '2026-03-05' },
        { regSeq: 10, regDate: '2026-03-05' },
        { regSeq: 2, regDate: '2026-01-10' },
        { regSeq: 30, regYear: 2025, regDate: '2025-12-30' },
      ]);
    });

    it.each([
      [undefined, ['10т/26', '9т/26', '2т/26', '30т/25']],
      ['regDate', ['30т/25', '2т/26', '9т/26', '10т/26']],
      ['-regNumber', ['10т/26', '9т/26', '2т/26', '30т/25']],
      ['regNumber', ['30т/25', '2т/26', '9т/26', '10т/26']],
    ])('sort=%s', async (sort, expected) => {
      const res = await list(sort ? { sort } : {});
      expect(numbers(res)).toEqual(expected);
    });
  });

  describe('search', () => {
    it('finds customers by substring, case-insensitively, including Cyrillic', async () => {
      await seed([{ customer: 'ТОВ «ПРИКЛАД»' }, { customer: 'ФОП Іванов' }]);

      const res = await list({ customer: 'приклад' });

      expect(res.body.data.map((r: { customer: string }) => r.customer)).toEqual(['ТОВ «ПРИКЛАД»']);
    });

    it('treats regex characters in the search literally', async () => {
      await seed([{ customer: 'ТОВ (Альфа)' }, { customer: 'ТОВ Альфа' }]);

      expect((await list({ customer: '(Альфа)' })).body.meta.total).toBe(1);
      expect((await list({ customer: '.*' })).body.meta.total).toBe(0);
    });

    it('searches by address', async () => {
      await seed([{ objectAddress: 'м. Київ, вул. Шевченка, 15' }, { objectAddress: 'м. Львів' }]);

      expect((await list({ address: 'шевченка' })).body.meta.total).toBe(1);
    });

    it('searches by a full number or by digits in any year', async () => {
      await seed([
        { regSeq: 15, regDate: '2026-02-01' },
        { regSeq: 15, regYear: 2025, regDate: '2025-02-01' },
        { regSeq: 16, regDate: '2026-02-01' },
      ]);

      expect(numbers(await list({ number: '15т/26' }))).toEqual(['15т/26']);
      expect(numbers(await list({ number: '15', sort: 'regNumber' }))).toEqual([
        '15т/25',
        '15т/26',
      ]);
    });
  });

  describe('filters', () => {
    it('by object type and by author', async () => {
      await seed([
        { objectType: 'DOMESTIC' },
        { objectType: 'NON_DOMESTIC', createdBy: colleague },
        { objectType: 'NON_DOMESTIC' },
      ]);

      expect((await list({ objectType: 'NON_DOMESTIC' })).body.meta.total).toBe(2);
      expect((await list({ createdBy: String(colleague) })).body.meta.total).toBe(1);
      expect(
        (await list({ createdBy: String(me), objectType: 'NON_DOMESTIC' })).body.meta.total,
      ).toBe(1);
    });

    it('by period, both ends inclusive', async () => {
      await seed([
        { regDate: '2026-02-28' },
        { regDate: '2026-03-01' },
        { regDate: '2026-03-31' },
        { regDate: '2026-04-01' },
      ]);

      const res = await list({ dateFrom: '2026-03-01', dateTo: '2026-03-31', sort: 'regDate' });

      expect(res.body.data.map((r: { regDate: string }) => r.regDate)).toEqual([
        '2026-03-01',
        '2026-03-31',
      ]);
      expect((await list({ dateFrom: '2026-04-01' })).body.meta.total).toBe(1);
      expect((await list({ dateTo: '2026-02-28' })).body.meta.total).toBe(1);
    });
  });

  it('pages through results', async () => {
    await seed(Array.from({ length: 25 }, (_, i) => ({ regSeq: i + 1 })));

    const first = await list({ limit: 10, sort: 'regNumber' });
    const last = await list({ limit: 10, page: 3, sort: 'regNumber' });

    expect(first.body.meta).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });
    expect(numbers(first)[0]).toBe('1т/26');
    expect(numbers(last)).toEqual(['21т/26', '22т/26', '23т/26', '24т/26', '25т/26']);
  });

  it.each([
    { page: 0 },
    { limit: 1000 },
    { sort: 'phone' },
    { number: 'abc' },
    { createdBy: 'x' },
    { dateFrom: '2026-03-10', dateTo: '2026-03-01' },
  ])('rejects invalid query %j', async (query) => {
    const res = await list(query as unknown as Record<string, string | number>);
    expect(res.status).toBe(400);
  });
});

describe('GET /users/options', () => {
  useTestDb();

  it('lists names for any signed-in user, including deactivated ones', async () => {
    const { accessToken } = await signedInUser(app, { login: 'regular' });
    await User.create({
      login: 'gone',
      fullName: 'Архівний Працівник',
      passwordHash: 'x',
      isActive: false,
    });

    const res = await request(app)
      .get('/api/v1/users/options')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fullName: 'Архівний Працівник', isActive: false }),
      ]),
    );
    expect(JSON.stringify(res.body)).not.toMatch(/login|passwordHash|role/);
  });
});
