import type { ApplicationDto, ContractDto, InvoiceDto } from '@tu-registry/shared';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { invoiceWorkbookBuffer } from './invoiceExcel';
import { invoicePdfDefinition } from './invoicePdf';
import { contractInForce, invoiceDocument } from './invoiceSections';

const invoice = {
  invoiceNumber: '6442/1',
  agreementNumber: 1,
  invoiceDate: '2026-11-20',
  comment: 'Не для файлу',
  works: [
    { group: 'CONSTRUCTION', name: 'Будівельно-монтажні роботи за кошторисом', amount: 2228653.2 },
    { group: 'TIE_IN', name: 'Врізання', amount: 121792.51 },
    { group: 'WORK_PLAN', name: 'Витрати газу', amount: 37152.36 },
  ],
  totals: {
    CONSTRUCTION: 2228653.2,
    TIE_IN: 121792.51,
    WORK_PLAN: 37152.36,
    EARTHWORKS: 0,
    total: 2387598.07,
  },
} as unknown as InvoiceDto;

const app = {
  customer: 'Франко Іван Якович',
  settlement: 'м. Одеса',
  objectAddress: 'вул. Водопровідна, 16',
} as unknown as ApplicationDto;

const contract = (number: string, date: string, cancelled = false) =>
  ({
    contractNumber: number,
    contractDate: date,
    createdAt: `${date}T09:00:00.000Z`,
    customer: 'Франко Іван',
    address: 'м. Одеса, вул. Водопровідна, 16',
    cancellation: cancelled ? { reason: 'x' } : null,
  }) as unknown as ContractDto;

describe('the calculation as a file (2026-11-22, 2026-11-23)', () => {
  const contracts = [
    contract('765', '2026-11-20'),
    contract('5665', '2026-11-19'),
    contract('800', '2026-11-21', true),
  ];
  const doc = invoiceDocument(invoice, app, contractInForce(contracts));

  it('takes the contract in force, its address and customer; no comment', () => {
    expect(doc.title).toBe('Розрахунок № 6442/1 від 20.11.2026');
    expect(doc.details).toEqual([
      { label: 'Договір', value: '№ 765 від 20.11.2026' },
      { label: 'Адреса', value: 'м. Одеса, вул. Водопровідна, 16' },
      { label: 'Замовник', value: 'Франко Іван' },
      { label: 'Додаткова угода', value: '№ 1' },
    ]);
    expect(doc.fileName).toBe('Розрахунок № 6442-1 від 20.11.2026');
    expect(JSON.stringify(doc)).not.toContain('Не для файлу');
  });

  it('without a contract: the application’s address and customer', () => {
    expect(invoiceDocument(invoice, app, undefined).details.slice(0, 3)).toEqual([
      { label: 'Договір', value: '—' },
      { label: 'Адреса', value: expect.stringContaining('вул. Водопровідна, 16') },
      { label: 'Замовник', value: 'Франко Іван Якович' },
    ]);
  });

  it('writes the Excel sheet: details, sections, works and the total', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await invoiceWorkbookBuffer(doc));
    const sheet = workbook.getWorksheet('Розрахунок')!;
    const rows: unknown[][] = [];
    sheet.eachRow((row) => rows.push([row.getCell(1).value, row.getCell(2).value ?? null]));

    expect(rows).toEqual([
      ['Розрахунок № 6442/1 від 20.11.2026', null],
      ['Договір: № 765 від 20.11.2026', null],
      ['Адреса: м. Одеса, вул. Водопровідна, 16', null],
      ['Замовник: Франко Іван', null],
      ['Додаткова угода: № 1', null],
      ['Найменування робіт', 'Вартість, грн'],
      ['Будівельно-монтажні роботи', 2350445.71],
      ['Будівельно-монтажні роботи за кошторисом', 2228653.2],
      ['Врізання', 121792.51],
      ['ПВР', 37152.36],
      ['Витрати газу', 37152.36],
      ['Всього:', 2387598.07],
    ]);
    expect(sheet.getCell('B8').numFmt).toBe('#,##0.00');
  });

  it('lays out the PDF with the same list', () => {
    const text = JSON.stringify(invoicePdfDefinition(doc).content);
    for (const part of [
      'Розрахунок № 6442/1 від 20.11.2026',
      '№ 765 від 20.11.2026',
      'Франко Іван',
      'Будівельно-монтажні роботи за кошторисом',
      'Всього:',
    ]) {
      expect(text).toContain(part);
    }
    expect(text).not.toContain('Не для файлу');
  });
});
