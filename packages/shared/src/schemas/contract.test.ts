import { describe, expect, it } from 'vitest';
import { formatContractNumber, parseContractNumber, saveContractSchema } from './contract';

describe('contract number', () => {
  it('writes the sequence, the department code and «Р» for a reconstruction', () => {
    expect(formatContractNumber(125, 15, false)).toBe('125-15');
    expect(formatContractNumber(126, 15, true)).toBe('126-15-Р');
  });

  it('reads back numbers in our format only', () => {
    expect(parseContractNumber(' 126-15-Р ')).toEqual({
      sequence: 126,
      departmentCode: 15,
      reconstruction: true,
    });
    expect(parseContractNumber('125-15')).toEqual({
      sequence: 125,
      departmentCode: 15,
      reconstruction: false,
    });
    expect(parseContractNumber('125/15')).toBeNull();
    expect(parseContractNumber('Д-7')).toBeNull();
  });
});

describe('saveContractSchema', () => {
  const valid = {
    contractNumber: ' 125-15 ',
    contractDate: '2026-11-10',
    department: 'ODESA',
    customer: 'Франко Іван Якович',
    address: 'м. Одеса, вул. Лесі Українки, 34',
  };

  it('trims the text and makes the empty optional fields null', () => {
    expect(
      saveContractSchema.parse({ ...valid, signedDate: '', representative: ' ', comment: '' }),
    ).toEqual({
      ...valid,
      contractNumber: '125-15',
      signedDate: null,
      representative: null,
      comment: null,
    });
  });

  it('does not let the contract be signed before its date', () => {
    const result = saveContractSchema.safeParse({ ...valid, signedDate: '2026-11-09' });
    expect(result.error?.issues[0]?.path).toEqual(['signedDate']);
  });

  it.each(['contractNumber', 'contractDate', 'customer', 'address'])('requires %s', (field) => {
    const result = saveContractSchema.safeParse({ ...valid, [field]: '' });
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });

  it('refuses fields it does not know', () => {
    expect(saveContractSchema.safeParse({ ...valid, sequence: 1 }).success).toBe(false);
  });
});
