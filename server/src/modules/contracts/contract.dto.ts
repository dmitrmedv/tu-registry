import type { ConnectionType, ContractDto, ScanDto } from '@tu-registry/shared';
import type { Types } from 'mongoose';
import { toIsoDate } from '../../utils/kyivDate';
import type { ScanRecord } from '../documents/document.dto';
import { findUserSummaries } from '../users/user.service';

export type ContractRecord = {
  _id: Types.ObjectId;
  applicationId: Types.ObjectId;
  technicalConditionsId: Types.ObjectId;
  connectionType: ConnectionType;
  contractNumber: string;
  sequence: number | null;
  contractDate: Date;
  department: string;
  customer: string;
  address: string;
  signedDate: Date | null;
  representative: string | null;
  comment: string | null;
  document?: ScanRecord | null;
  scan?: ScanRecord | null;
  cancellation?: { reason: string; at: Date; by: Types.ObjectId } | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  version: number;
};

/** The stored files of `rows`: for deleting them with the contract or its application. */
export const contractFiles = (rows: Pick<ContractRecord, 'document' | 'scan'>[]) =>
  rows.flatMap((row) => [
    ...(row.document ? [{ fileId: row.document.fileId, type: 'docx' as const }] : []),
    ...(row.scan ? [{ fileId: row.scan.fileId, type: 'pdf' as const }] : []),
  ]);

/** The API shape, with people's names looked up in one query for all `rows`. */
export async function contractDtos(rows: ContractRecord[]): Promise<ContractDto[]> {
  const names = await findUserSummaries(
    rows.flatMap((row) => [
      String(row.createdBy),
      row.cancellation ? String(row.cancellation.by) : null,
      row.document ? String(row.document.uploadedBy) : null,
      row.scan ? String(row.scan.uploadedBy) : null,
    ]),
  );
  const person = (id: Types.ObjectId) => ({
    id: String(id),
    fullName: names.get(String(id))?.fullName ?? '—',
  });
  const file = (scan: ScanRecord | null | undefined): ScanDto | null =>
    scan
      ? {
          name: scan.name,
          size: scan.size,
          uploadedAt: scan.uploadedAt.toISOString(),
          uploadedBy: person(scan.uploadedBy),
        }
      : null;
  return rows.map((row) => ({
    id: String(row._id),
    applicationId: String(row.applicationId),
    connectionType: row.connectionType,
    contractNumber: row.contractNumber,
    contractDate: toIsoDate(row.contractDate),
    department: row.department,
    customer: row.customer,
    address: row.address,
    signedDate: row.signedDate ? toIsoDate(row.signedDate) : null,
    representative: row.representative,
    comment: row.comment,
    document: file(row.document),
    scan: file(row.scan),
    cancellation: row.cancellation
      ? {
          reason: row.cancellation.reason,
          at: row.cancellation.at.toISOString(),
          by: person(row.cancellation.by),
        }
      : null,
    createdBy: person(row.createdBy),
    createdAt: row.createdAt.toISOString(),
    version: row.version,
  }));
}
