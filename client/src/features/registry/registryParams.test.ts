import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, readParams, toApiQuery, writeParams } from './registryParams';

const ME = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('registry URL params', () => {
  it('falls back to defaults for anything malformed', () => {
    const params = readParams(
      new URLSearchParams('page=-2&limit=7&sort=phone&type=X&user=<script>&from=yesterday'),
    );
    expect(params).toEqual(DEFAULT_PARAMS);
  });

  it('round-trips through the URL and omits defaults', () => {
    const params = { ...DEFAULT_PARAMS, customer: 'ТОВ', page: 2, user: 'all' };
    expect(writeParams(params).toString()).toBe(
      `page=2&customer=${encodeURIComponent('ТОВ')}&user=all`,
    );
    expect(readParams(writeParams(params))).toEqual(params);
  });

  it('maps "mine" to the current user and leaves out invalid inputs', () => {
    const query = toApiQuery(
      { ...DEFAULT_PARAMS, number: 'abc', from: '2026-03-10', to: '2026-03-01' },
      ME,
    );
    expect(query).toMatchObject({ createdBy: ME, number: undefined, dateFrom: '2026-03-10' });
    expect(query.dateTo).toBeUndefined();
  });
});
