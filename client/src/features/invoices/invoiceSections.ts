import {
  type ApplicationDto,
  type ContractDto,
  fullAddress,
  type InvoiceDto,
  type InvoiceWorkGroup,
  invoiceNumberText,
} from '@tu-registry/shared';
import { formatCalendarDate } from '@/shared/lib/format';
import { INVOICE_WORK_GROUP_LABELS } from '@/shared/lib/labels';

/**
 * The calculation's sections (mock-up of 2026-11-22): the tie-in goes with the construction
 * works, under their common sum; the permits only where they were entered (most connections
 * have none). The card and its Excel file show the same.
 */
const SECTIONS: { groups: InvoiceWorkGroup[]; optional?: boolean }[] = [
  { groups: ['CONSTRUCTION', 'TIE_IN'] },
  { groups: ['WORK_PLAN'] },
  { groups: ['EARTHWORKS'], optional: true },
];

export type InvoiceSection = {
  label: string;
  sum: number;
  works: InvoiceDto['works'];
};

export function invoiceSections(invoice: InvoiceDto): InvoiceSection[] {
  return SECTIONS.flatMap(({ groups, optional }) => {
    const works = invoice.works.filter((work) => groups.includes(work.group));
    if (optional && works.length === 0) return [];
    return [
      {
        label: INVOICE_WORK_GROUP_LABELS[groups[0]!],
        sum: groups.reduce((total, group) => total + invoice.totals[group], 0),
        works,
      },
    ];
  });
}

/** «№ 1 від 20.11.2026». */
export const invoiceTitle = (invoice: InvoiceDto) =>
  `${invoiceNumberText(invoice.invoiceNumber)} від ${formatCalendarDate(invoice.invoiceDate)}`;

/** The contract in force: the last one not cancelled, by its date. */
export function contractInForce(contracts: ContractDto[]) {
  return contracts
    .filter((contract) => !contract.cancellation)
    .sort(
      (a, b) =>
        a.contractDate.localeCompare(b.contractDate) || a.createdAt.localeCompare(b.createdAt),
    )
    .at(-1);
}

/** The calculation as a document: its Excel file and its PDF show the same (2026-11-23). */
export type InvoiceDocument = {
  title: string;
  /** Above the works: the contract, the address, the customer, the agreement. */
  details: { label: string; value: string }[];
  sections: InvoiceSection[];
  total: number;
  /** Without the extension; no characters a file name may not have. */
  fileName: string;
};

/**
 * The contract's number and date, the full address and the customer — from the contract in
 * force, as written in it; without one, the address and the customer of the application.
 */
export function invoiceDocument(
  invoice: InvoiceDto,
  app: ApplicationDto,
  contract: ContractDto | undefined,
): InvoiceDocument {
  const title = `Розрахунок ${invoiceTitle(invoice)}`;
  return {
    title,
    details: [
      {
        label: 'Договір',
        value: contract
          ? `№ ${contract.contractNumber} від ${formatCalendarDate(contract.contractDate)}`
          : '—',
      },
      {
        label: 'Адреса',
        value: contract?.address ?? fullAddress(app.settlement, app.objectAddress),
      },
      { label: 'Замовник', value: contract?.customer ?? app.customer },
      {
        label: 'Додаткова угода',
        value: invoice.agreementNumber === null ? '—' : `№ ${invoice.agreementNumber}`,
      },
    ],
    sections: invoiceSections(invoice),
    total: invoice.totals.total,
    fileName: title.replace(/[\\/:*?"<>|]/g, '-'),
  };
}
