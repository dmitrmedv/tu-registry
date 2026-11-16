import { describe, expect, it } from 'vitest';
import {
  countMoreFilters,
  DEFAULT_PARAMS,
  readParams,
  toApiQuery,
  writeParams,
} from './registryParams';

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
      q: 'ТОВ',
      page: 2,
      category: 'APARTMENT' as const,
      user: 'mine',
    };
    expect(writeParams(params).toString()).toBe(
      `page=2&q=${encodeURIComponent('ТОВ')}&category=APARTMENT&user=mine`,
    );
    expect(readParams(writeParams(params))).toEqual(params);
  });

  it("shows everyone's applications by default", () => {
    expect(toApiQuery(DEFAULT_PARAMS, ME).createdBy).toBeUndefined();
    expect(toApiQuery(DEFAULT_PARAMS, ME).sort).toBe('-regDate');
  });

  it('maps "mine" to the current user and leaves out a period in the wrong order', () => {
    const query = toApiQuery(
      { ...DEFAULT_PARAMS, user: 'mine', q: 'abc', from: '2026-03-10', to: '2026-03-01' },
      ME,
    );
    expect(query).toMatchObject({ createdBy: ME.id, q: 'abc', dateFrom: '2026-03-10' });
    expect(query.dateTo).toBeUndefined();
  });

  it('reads «Стан» and the engineer, and old ?status=ANNULLED links as annulled', () => {
    const params = readParams(
      new URLSearchParams('stage=TU_PREPARED&engineer=cccccccccccccccccccccccc'),
    );
    expect(params).toMatchObject({ stage: 'TU_PREPARED', engineer: 'cccccccccccccccccccccccc' });
    expect(toApiQuery(params, ME)).toMatchObject({
      stage: 'TU_PREPARED',
      engineer: 'cccccccccccccccccccccccc',
    });
    expect(readParams(new URLSearchParams('status=ANNULLED')).stage).toBe('ANNULLED');
    expect(readParams(new URLSearchParams('status=ACTIVE')).stage).toBe('');
    expect(readParams(new URLSearchParams('stage=DONE&engineer=Бойко'))).toEqual(DEFAULT_PARAMS);
  });

  it('forgets the per-field searches of old links', () => {
    expect(readParams(new URLSearchParams('customer=ТОВ&number=15'))).toEqual(DEFAULT_PARAMS);
  });

  it('counts what is set behind «Ще фільтри»', () => {
    expect(countMoreFilters(DEFAULT_PARAMS)).toBe(0);
    expect(
      countMoreFilters({
        ...DEFAULT_PARAMS,
        q: 'x',
        from: '2026-01-01',
        area: 'URBAN',
        stage: 'RESPONDED',
        engineer: 'cccccccccccccccccccccccc',
        user: 'mine',
      }),
    ).toBe(4);
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
