import { describe, expect, it } from 'vitest';
import { applicationListQuerySchema, regNumberSearchField } from './applicationList';

describe('applicationListQuerySchema', () => {
  it('applies defaults and drops empty query values', () => {
    expect(
      applicationListQuerySchema.parse({
        customer: '',
        objectType: '',
        objectCategory: '',
        createdBy: '',
        sort: '',
      }),
    ).toEqual({ page: 1, limit: 20, sort: '-regDate' });
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
    { sort: 'customer' },
    { objectType: 'INDUSTRIAL' },
    { objectCategory: 'CASTLE' },
    { createdBy: 'not-an-id' },
    { dateFrom: '2026-02-30' },
    { dateFrom: '2026-03-10', dateTo: '2026-03-01' },
  ])('rejects %j', (query) => {
    expect(applicationListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('regNumberSearchField', () => {
  it.each([
    ['15', { seq: 15 }],
    ['15т/26', { year: 2026, seq: 15 }],
    [' 15t/2026 ', { year: 2026, seq: 15 }],
    ['', undefined],
  ])('%j → %j', (input, expected) => {
    expect(regNumberSearchField.parse(input)).toEqual(expected);
  });

  it.each(['0', 'abc', '15/26'])('rejects %j', (input) => {
    expect(regNumberSearchField.safeParse(input).success).toBe(false);
  });
});
