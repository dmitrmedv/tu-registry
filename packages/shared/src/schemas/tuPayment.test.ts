import { describe, expect, it } from 'vitest';
import { formatHryvnias, fromKopecks, saveTuPaymentSchema, toKopecks } from './tuPayment';

const invoice = { invoiceNumber: ' 125/Б ', invoiceDate: '2026-11-02', amount: '1 234,56' };

const errorsOf = (input: unknown) => {
  const result = saveTuPaymentSchema.safeParse(input);
  return result.success ? {} : result.error.flatten().fieldErrors;
};

describe('saveTuPaymentSchema', () => {
  it('takes an invoice alone; later dates are empty until known', () => {
    expect(saveTuPaymentSchema.parse(invoice)).toEqual({
      invoiceNumber: '125/Б',
      invoiceDate: '2026-11-02',
      amount: 1234.56,
      paidDate: null,
      actTransferredDate: null,
    });
    expect(saveTuPaymentSchema.parse({ ...invoice, paidDate: '', version: 2 })).toMatchObject({
      paidDate: null,
      version: 2,
    });
  });

  it('reads the amount as people type it: spaces, a comma, at most kopecks', () => {
    const amount = (value: unknown) =>
      saveTuPaymentSchema.parse({ ...invoice, amount: value }).amount;
    expect(amount('2 400')).toBe(2400);
    expect(amount(99.9)).toBe(99.9);
    expect(errorsOf({ ...invoice, amount: '10,555' }).amount).toEqual([
      'Не більше двох знаків після коми',
    ]);
    expect(errorsOf({ ...invoice, amount: '0' }).amount).toEqual(['Сума має бути більшою за нуль']);
    expect(errorsOf({ ...invoice, amount: 'сто' }).amount).toBeDefined();
  });

  it('keeps the dates in the order things happen', () => {
    expect(errorsOf({ ...invoice, paidDate: '2026-11-01' }).paidDate).toEqual([
      'Дата оплати не може бути раніше дати рахунку',
    ]);
    expect(errorsOf({ ...invoice, actTransferredDate: '2026-11-05' }).actTransferredDate).toEqual([
      'Спершу вкажіть дату оплати',
    ]);
    expect(
      errorsOf({ ...invoice, paidDate: '2026-11-04', actTransferredDate: '2026-11-03' })
        .actTransferredDate,
    ).toEqual(['Дата передачі не може бути раніше дати оплати']);
    expect(
      errorsOf({ ...invoice, paidDate: '2026-11-04', actTransferredDate: '2026-11-04' }),
    ).toEqual({});
  });

  it('requires the number, date and sum, and nothing else', () => {
    expect(Object.keys(errorsOf({}))).toEqual(['invoiceNumber', 'invoiceDate', 'amount']);
    expect(saveTuPaymentSchema.safeParse({ ...invoice, department: 'ODESA' }).success).toBe(false);
  });
});

describe('money', () => {
  it('stores kopecks exactly and shows hryvnias', () => {
    expect(toKopecks(0.1 + 0.2)).toBe(30);
    expect(toKopecks(1234.56)).toBe(123456);
    expect(fromKopecks(123456)).toBe(1234.56);
    expect(formatHryvnias(1234.5).replace(/\s/g, ' ')).toBe('1 234,50 грн');
  });
});
