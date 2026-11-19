import { describe, expect, it } from 'vitest';
import { preferenceParamsSchema, tablePreferencesSchema } from './preferences';

describe('table preferences', () => {
  it('takes the visible columns, widths and order', () => {
    const prefs = {
      visible: { gasFlow: true, tuNumber: false },
      widths: { objectAddress: 386.5 },
      order: ['department', 'regDate'],
    };
    expect(tablePreferencesSchema.parse(prefs)).toEqual(prefs);
  });

  it('refuses keys that are not column names, odd widths and repeated columns', () => {
    for (const prefs of [
      { visible: { $where: true }, widths: {}, order: [] },
      { visible: { 'a.b': true }, widths: {}, order: [] },
      { visible: {}, widths: { customer: 0 }, order: [] },
      { visible: {}, widths: { customer: 5000 }, order: [] },
      { visible: {}, widths: {}, order: ['customer', 'customer'] },
      { visible: {}, widths: {}, order: [], extra: 1 },
    ]) {
      expect(tablePreferencesSchema.safeParse(prefs).success).toBe(false);
    }
  });

  it('knows only the tables with configurable columns', () => {
    expect(preferenceParamsSchema.safeParse({ table: 'registry' }).success).toBe(true);
    expect(preferenceParamsSchema.safeParse({ table: 'users' }).success).toBe(false);
  });
});
