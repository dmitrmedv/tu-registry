import { fromKopecks, type ScanDto, type TuPaymentDto } from '@tu-registry/shared';
import mongoose, { type Types } from 'mongoose';
import { toIsoDate } from '../../utils/kyivDate';
import type { ScanRecord } from '../documents/document.dto';
import { findUserSummaries } from '../users/user.service';
import { TuPayment } from './tuPayment.model';

export type TuPaymentRecord = {
  _id: Types.ObjectId;
  technicalConditionsId: Types.ObjectId;
  applicationId: Types.ObjectId;
  department: string;
  invoiceNumber: string;
  invoiceDate: Date;
  amountKopecks: number;
  paidDate: Date | null;
  paidAmountKopecks?: number | null;
  invoiceScan?: ScanRecord | null;
  receiptScan?: ScanRecord | null;
  actScan?: ScanRecord | null;
  actTransferMonth: string | null;
  contractNumber?: number | null;
  contractDate?: Date | null;
  contractScan?: ScanRecord | null;
  contractDocument?: ScanRecord | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  version: number;
};

type PaymentFiles = Pick<
  TuPaymentRecord,
  'invoiceScan' | 'receiptScan' | 'actScan' | 'contractScan' | 'contractDocument'
>;

/** The stored files of `rows` (the Word document is .docx), for deleting them for good. */
export const paymentFiles = (rows: PaymentFiles[]) =>
  rows.flatMap((row) => [
    ...[row.invoiceScan, row.receiptScan, row.actScan, row.contractScan]
      .filter((scan) => !!scan)
      .map((scan) => ({ fileId: scan.fileId, type: 'pdf' as const })),
    ...(row.contractDocument
      ? [{ fileId: row.contractDocument.fileId, type: 'docx' as const }]
      : []),
  ]);

/** The fields that hold the payment's files: for loading only them. */
export const PAYMENT_FILE_FIELDS = 'invoiceScan receiptScan actScan contractScan contractDocument';

/** The payments of these technical conditions, by their id, in API shape. */
export async function paymentDtos(tuIds: Types.ObjectId[]) {
  const rows = tuIds.length
    ? await TuPayment.find({
        technicalConditionsId: mongoose.trusted({ $in: tuIds }),
      }).lean<TuPaymentRecord[]>()
    : [];
  const names = await findUserSummaries(
    rows.flatMap((row) => [
      String(row.createdBy),
      row.invoiceScan ? String(row.invoiceScan.uploadedBy) : null,
      row.receiptScan ? String(row.receiptScan.uploadedBy) : null,
      row.actScan ? String(row.actScan.uploadedBy) : null,
      row.contractScan ? String(row.contractScan.uploadedBy) : null,
      row.contractDocument ? String(row.contractDocument.uploadedBy) : null,
    ]),
  );
  const person = (id: Types.ObjectId) => ({
    id: String(id),
    fullName: names.get(String(id))?.fullName ?? '—',
  });
  const scanDto = (scan?: ScanRecord | null): ScanDto | null =>
    scan
      ? {
          name: scan.name,
          size: scan.size,
          uploadedAt: scan.uploadedAt.toISOString(),
          uploadedBy: person(scan.uploadedBy),
        }
      : null;
  return new Map(
    rows.map((row): [string, TuPaymentDto] => [
      String(row.technicalConditionsId),
      {
        id: String(row._id),
        invoiceNumber: row.invoiceNumber,
        invoiceDate: toIsoDate(row.invoiceDate),
        amount: fromKopecks(row.amountKopecks),
        paidDate: row.paidDate ? toIsoDate(row.paidDate) : null,
        paidAmount: row.paidAmountKopecks ? fromKopecks(row.paidAmountKopecks) : null,
        actTransferMonth: row.actTransferMonth,
        invoiceScan: scanDto(row.invoiceScan),
        receiptScan: scanDto(row.receiptScan),
        actScan: scanDto(row.actScan),
        contractNumber: row.contractNumber ?? null,
        contractDate: row.contractDate ? toIsoDate(row.contractDate) : null,
        contractScan: scanDto(row.contractScan),
        contractDocument: scanDto(row.contractDocument),
        createdBy: person(row.createdBy),
        createdAt: row.createdAt.toISOString(),
        version: row.version,
      },
    ]),
  );
}
