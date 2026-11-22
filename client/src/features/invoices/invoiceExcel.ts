import ExcelJS from 'exceljs';
import type { InvoiceDocument } from './invoiceSections';

const SUM_FORMAT = '#,##0.00';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * The calculation as an Excel sheet (2026-11-22), as the card shows it: the contract, the
 * address, the customer and the agreement on top (2026-11-23), then each section with its sum,
 * its works under it, and «Всього:». Sums are numbers (Excel adds them up), in hryvnias.
 * Loaded only when asked for: exceljs is large.
 */
export async function invoiceWorkbookBuffer(doc: InvoiceDocument) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Розрахунок');
  sheet.columns = [{ width: 60 }, { width: 18, style: { numFmt: SUM_FORMAT } }];

  sheet.addRow([doc.title]).font = { bold: true, size: 14 };
  for (const { label, value } of doc.details) {
    sheet.addRow([`${label}: ${value}`]).getCell(1).alignment = { wrapText: true };
  }
  sheet.addRow([]);
  const head = sheet.addRow(['Найменування робіт', 'Вартість, грн']);
  head.font = { bold: true };
  head.getCell(2).alignment = { horizontal: 'right' };

  for (const section of doc.sections) {
    sheet.addRow([section.label, section.sum]).font = { bold: true };
    for (const work of section.works) {
      sheet.addRow([work.name, work.amount]).getCell(1).alignment = { indent: 1, wrapText: true };
    }
  }

  const total = sheet.addRow(['Всього:', doc.total]);
  total.font = { bold: true };
  total.eachCell((cell) => {
    cell.border = { top: { style: 'thin' } };
  });
  return workbook.xlsx.writeBuffer();
}

export async function invoiceWorkbook(doc: InvoiceDocument) {
  return new Blob([await invoiceWorkbookBuffer(doc)], { type: XLSX_TYPE });
}
