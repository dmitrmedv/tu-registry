import { formatHryvnias } from '@tu-registry/shared';
import pdfMake from 'pdfmake/build/pdfmake';
import vfs from 'pdfmake/build/vfs_fonts';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { InvoiceDocument } from './invoiceSections';

// Wide enough for «12 345 678,90 грн» on one line.
const SUM_WIDTH = 120;

// Roboto, with Cyrillic, from pdfmake's own fonts.
pdfMake.addVirtualFileSystem(vfs);

/**
 * The calculation as a PDF (2026-11-23): the same list as its Excel file, opened in the
 * browser's viewer to save or print. Loaded only when asked for: pdfmake is large.
 */
export function invoicePdfDefinition(doc: InvoiceDocument): TDocumentDefinitions {
  const rows: Content[][] = [
    [
      { text: 'Найменування робіт', bold: true },
      { text: 'Вартість, грн', bold: true, alignment: 'right', noWrap: true },
    ],
  ];
  for (const section of doc.sections) {
    rows.push([
      { text: section.label, bold: true, margin: [0, 6, 0, 0] },
      {
        text: formatHryvnias(section.sum),
        bold: true,
        alignment: 'right',
        noWrap: true,
        margin: [0, 6, 0, 0],
      },
    ]);
    for (const work of section.works) {
      rows.push([
        { text: work.name, margin: [12, 0, 0, 0] },
        { text: formatHryvnias(work.amount), alignment: 'right', noWrap: true },
      ]);
    }
  }
  return {
    info: { title: doc.title },
    pageSize: 'A4',
    pageMargins: [56, 48, 40, 48],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    content: [
      { text: doc.title, bold: true, fontSize: 14, margin: [0, 0, 0, 8] },
      ...doc.details.map(({ label, value }): Content => ({
        text: [{ text: `${label}: `, color: '#555555' }, value],
        margin: [0, 0, 0, 2],
      })),
      {
        margin: [0, 12, 0, 0],
        table: { headerRows: 1, widths: ['*', SUM_WIDTH], body: rows },
        layout: {
          hLineWidth: (index) => (index === 1 ? 0.5 : 0),
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
        },
      },
      {
        margin: [0, 8, 0, 0],
        table: {
          widths: ['*', SUM_WIDTH],
          body: [
            [
              { text: 'Всього:', bold: true },
              { text: formatHryvnias(doc.total), bold: true, alignment: 'right', noWrap: true },
            ],
          ],
        },
        layout: {
          hLineWidth: (index) => (index === 0 ? 1 : 0),
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 6,
        },
      },
    ],
  };
}

export const invoicePdf = (doc: InvoiceDocument) =>
  pdfMake.createPdf(invoicePdfDefinition(doc)).getBlob();
