import { describe, expect, it } from 'vitest';
import { parseRegNumberSearch } from '../regNumber';
import { applicationListQuerySchema } from './applicationList';

describe('applicationListQuerySchema', () => {
  it('applies defaults and drops empty query values', () => {
    expect(
      applicationListQuerySchema.parse({
        q: '',
        objectType: '',
        objectCategory: '',
        createdBy: '',
        sort: '',
      }),
    ).toEqual({ page: 1, limit: 20, sort: '-regDate' });
  });

  it('accepts a sort for every registry column, ascending and descending', () => {
    for (const sort of ['customer', '-customerRepresentative', 'areaType', '-createdBy']) {
      expect(applicationListQuerySchema.parse({ sort }).sort).toBe(sort);
    }
  });

  it('takes one trimmed search text and filters by area', () => {
    expect(applicationListQuerySchema.parse({ q: ' Петренко ', areaType: 'RURAL' })).toMatchObject({
      q: 'Петренко',
      areaType: 'RURAL',
    });
  });

  it('filters by «Стан» and engineer, sorts by the documents', () => {
    expect(
      applicationListQuerySchema.parse({
        stage: 'ANNULLED',
        engineer: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        sort: '-tuDate',
      }),
    ).toMatchObject({ stage: 'ANNULLED', engineer: 'aaaaaaaaaaaaaaaaaaaaaaaa', sort: '-tuDate' });
    for (const sort of ['stage', '-lastResponseDate', 'gasFlow', '-engineer']) {
      expect(applicationListQuerySchema.parse({ sort }).sort).toBe(sort);
    }
  });

  it('filters by object category', () => {
    expect(applicationListQuerySchema.parse({ objectCategory: 'LAND_PLOT' }).objectCategory).toBe(
      'LAND_PLOT',
    );
  });

  it('coerces paging values from strings', () => {
    expect(applicationListQuerySchema.parse({ page: '3', limit: '50' })).toMatchObject({
      page: 3,
      limit: 50,
    });
  });

  it.each([
    { page: '0' },
    { limit: '5' },
    { limit: '500' },
    { objectType: 'INDUSTRIAL' },
    { objectCategory: 'CASTLE' },
    { areaType: 'SUBURBAN' },
    { sort: 'phone' },
    { q: 'я'.repeat(201) },
    { createdBy: 'not-an-id' },
    { stage: 'ACTIVE' },
    { engineer: 'Бойко' },
    { dateFrom: '2026-02-30' },
    { dateFrom: '2026-03-10', dateTo: '2026-03-01' },
  ])('rejects %j', (query) => {
    expect(applicationListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('parseRegNumberSearch', () => {
  it.each([
    ['15', { seq: 15 }],
    ['15т/26', { year: 2026, seq: 15 }],
    [' 15t/2026 ', { year: 2026, seq: 15 }],
    ['15т/26-8', { year: 2026, seq: 15, departmentCode: 8 }],
    // Typed so far: what is complete narrows the search, the rest waits.
    ['5т', { seq: 5 }],
    ['5 Т', { seq: 5 }],
    ['5t', { seq: 5 }],
    ['5т/', { seq: 5 }],
    ['5т/2', { seq: 5 }],
    ['5т/202', { seq: 5 }],
    ['5т/26-', { year: 2026, seq: 5 }],
    ['5т / 2026 - 1', { year: 2026, seq: 5, departmentCode: 1 }],
  ])('%j → %j', (input, expected) => {
    expect(parseRegNumberSearch(input)).toEqual(expected);
  });

  it.each(['', '0', '0т', 'abc', '15/26', 'т5', '5т/26-8-1', 'вул. Шевченка, 15'])(
    '%j is not a number',
    (input) => {
      expect(parseRegNumberSearch(input)).toBeNull();
    },
  );
});
