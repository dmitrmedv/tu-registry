import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, readParams, toApiQuery, writeParams } from './registryParams';

const ME = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'USER' as const };
const ADMIN = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', role: 'ADMIN' as const };

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
    expect(query).toMatchObject({ createdBy: ME.id, number: undefined, dateFrom: '2026-03-10' });
    expect(query.dateTo).toBeUndefined();
  });

  it("sends an admin's department (Одеське by default, none for «all»); never a user's", () => {
    expect(toApiQuery(DEFAULT_PARAMS, ADMIN).department).toBe('ODESA');
    expect(toApiQuery({ ...DEFAULT_PARAMS, department: 'all' }, ADMIN).department).toBeUndefined();
    expect(toApiQuery({ ...DEFAULT_PARAMS, department: 'RENI' }, ME).department).toBeUndefined();
    // Departments live in the database: any well-formed id is kept (the server decides).
    expect(readParams(new URLSearchParams('department=NEW_1')).department).toBe('NEW_1');
    expect(readParams(new URLSearchParams('department=bad id!')).department).toBe('ODESA');
    expect(writeParams({ ...DEFAULT_PARAMS, department: 'all' }).toString()).toBe('department=all');
  });
});
