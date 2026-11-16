import type { PreviousScanDto, ScanDto } from '@tu-registry/shared';
import type { Types } from 'mongoose';
import { findUserSummaries } from '../users/user.service';

export type ScanRecord = {
  fileId: string;
  name: string;
  size: number;
  uploadedAt: Date;
  uploadedBy: Types.ObjectId;
};

/** What responses and technical conditions have in common. */
export type DocumentRecord = {
  _id: Types.ObjectId;
  applicationId: Types.ObjectId;
  engineer: Types.ObjectId;
  engineerName: string;
  scan?: ScanRecord | null;
  previousScans: ScanRecord[];
  cancellation?: { reason: string; at: Date; by: Types.ObjectId } | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  version: number;
};

const allScans = (row: DocumentRecord) => [...(row.scan ? [row.scan] : []), ...row.previousScans];

/** The stored files of `rows`, every version: for deleting them with their application. */
export const documentFileIds = (rows: Pick<DocumentRecord, 'scan' | 'previousScans'>[]) =>
  rows.flatMap((row) => allScans(row as DocumentRecord).map((scan) => scan.fileId));

/**
 * Turns the parts every document has into their API shape, with people's names looked up in
 * one query for all `rows`.
 */
export async function documentDtoParts(rows: DocumentRecord[]) {
  const names = await findUserSummaries(
    rows.flatMap((row) => [
      String(row.createdBy),
      row.cancellation ? String(row.cancellation.by) : null,
      ...allScans(row).map((scan) => String(scan.uploadedBy)),
    ]),
  );
  const person = (id: Types.ObjectId) => ({
    id: String(id),
    fullName: names.get(String(id))?.fullName ?? '—',
  });
  const scanDto = (scan: ScanRecord): ScanDto => ({
    name: scan.name,
    size: scan.size,
    uploadedAt: scan.uploadedAt.toISOString(),
    uploadedBy: person(scan.uploadedBy),
  });
  return (row: DocumentRecord) => ({
    id: String(row._id),
    applicationId: String(row.applicationId),
    engineer: { id: String(row.engineer), fullName: row.engineerName },
    scan: row.scan ? scanDto(row.scan) : null,
    previousScans: row.previousScans.map((scan): PreviousScanDto => ({
      id: scan.fileId,
      ...scanDto(scan),
    })),
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
  });
}
