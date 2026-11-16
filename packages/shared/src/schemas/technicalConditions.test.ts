import { describe, expect, it } from 'vitest';
import {
  createTechnicalConditionsSchema,
  updateTechnicalConditionsSchema,
} from './technicalConditions';

const valid = {
  tuNumber: ' 0032/ТУ ',
  preparedDate: '2026-11-12',
  engineer: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  gasFlow: '2,5',
  connectionType: 'STANDARD',
  gasPressure: 'LOW',
  connectionPoint: 'UNDERGROUND',
};

describe('technical conditions schemas', () => {
  it('trims the number and reads the gas flow with a decimal comma', () => {
    expect(createTechnicalConditionsSchema.parse(valid)).toEqual({
      ...valid,
      tuNumber: '0032/ТУ',
      gasFlow: 2.5,
    });
    expect(createTechnicalConditionsSchema.parse({ ...valid, gasFlow: 12.345 }).gasFlow).toBe(
      12.345,
    );
    expect(createTechnicalConditionsSchema.parse({ ...valid, gasFlow: '100000' }).gasFlow).toBe(
      100_000,
    );
  });

  it.each([
    ['0', 'Витрати газу мають бути більшими за нуль'],
    ['-1', 'Витрати газу мають бути більшими за нуль'],
    ['0,0001', 'Не більше трьох знаків після коми'],
    ['100001', 'Витрати газу: не більше 100 000 м³/год'],
    ['багато', 'Вкажіть витрати газу числом'],
    ['', 'Вкажіть витрати газу числом'],
  ])('refuses the gas flow %j', (gasFlow, message) => {
    const result = createTechnicalConditionsSchema.safeParse({ ...valid, gasFlow });
    expect(result.error?.issues[0]?.message.replace(/\u00a0/g, ' ')).toBe(message);
  });

  it.each([
    { connectionType: 'CUSTOM' },
    { gasPressure: 'ULTRA' },
    { connectionPoint: 'AIR' },
    { tuNumber: '' },
    { preparedDate: '12.11.2026' },
    { scan: 'x' },
  ])('rejects %j', (override) => {
    expect(createTechnicalConditionsSchema.safeParse({ ...valid, ...override }).success).toBe(
      false,
    );
  });

  it('edits any field with the version seen', () => {
    expect(updateTechnicalConditionsSchema.parse({ version: 1, gasFlow: '3' })).toEqual({
      version: 1,
      gasFlow: 3,
    });
    expect(updateTechnicalConditionsSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(updateTechnicalConditionsSchema.safeParse({ gasFlow: 3 }).success).toBe(false);
  });
});
