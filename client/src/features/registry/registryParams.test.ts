import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, readParams, toApiQuery, writeParams } from './registryParams';

const ME = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('registry URL params', () => {
  it('falls back to defaults for anything malformed', () => {
    const params = readParams(
      new URLSearchParams(
        'page=-2&limit=7&sort=phone&type=X&category=CASTLE&user=<script>&from=yesterday',
      ),
    );
    expect(params).toEqual(DEFAULT_PARAMS);
  });

  it('round-trips through the URL and omits defaults', () => {
    const params = {
      ...DEFAULT_PARAMS,
      customer: 'ТОВ',
      page: 2,
      category: 'APARTMENT' as const,
      user: 'mine',
    };
    expect(writeParams(params).toString()).toBe(
      `page=2&customer=${encodeURIComponent('ТОВ')}&category=APARTMENT&user=mine`,
    );
    expect(readParams(writeParams(params))).toEqual(params);
  });

  it("shows everyone's applications by default", () => {
    expect(toApiQuery(DEFAULT_PARAMS, ME).createdBy).toBeUndefined();
    expect(toApiQuery(DEFAULT_PARAMS, ME).sort).toBe('-regDate');
  });

  it('maps "mine" to the current user and leaves out invalid inputs', () => {
    const query = toApiQuery(
      { ...DEFAULT_PARAMS, user: 'mine', number: 'abc', from: '2026-03-10', to: '2026-03-01' },
      ME,
    );
    expect(query).toMatchObject({ createdBy: ME, number: undefined, dateFrom: '2026-03-10' });
    expect(query.dateTo).toBeUndefined();
  });
});
