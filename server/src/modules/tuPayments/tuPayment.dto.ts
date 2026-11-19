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
  receiptScan?: ScanRecord | null;
  actScan?: ScanRecord | null;
  actTransferredDate: Date | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  version: number;
};

export const paymentFileIds = (rows: Pick<TuPaymentRecord, 'receiptScan' | 'actScan'>[]) =>
  rows.flatMap((row) => [row.receiptScan?.fileId, row.actScan?.fileId]).filter(Boolean) as string[];

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
      row.receiptScan ? String(row.receiptScan.uploadedBy) : null,
      row.actScan ? String(row.actScan.uploadedBy) : null,
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
        actTransferredDate: row.actTransferredDate ? toIsoDate(row.actTransferredDate) : null,
        receiptScan: scanDto(row.receiptScan),
        actScan: scanDto(row.actScan),
        createdBy: person(row.createdBy),
        createdAt: row.createdAt.toISOString(),
        version: row.version,
      },
    ]),
  );
}
