import type { Types } from 'mongoose';
import { deleteStoredFile } from '../scans/scan.storage';
import { Invoice } from './invoice.model';

/**
 * The invoice's scan was dropped (agreed 2026-11-22): its stored files are deleted and the field
 * removed. Through the driver: the field is no longer in the schema. Safe to run repeatedly.
 */
export async function dropInvoiceScans() {
  const rows = await Invoice.collection
    .find({ scan: { $exists: true } })
    .project<{ _id: Types.ObjectId; scan?: { fileId?: string } | null }>({ scan: 1 })
    .toArray();
  for (const row of rows) {
    await Invoice.collection.updateOne({ _id: row._id }, { $unset: { scan: 1 } });
    // After the change: a failed update must not lose a file still referred to.
    if (row.scan?.fileId) await deleteStoredFile(row.scan.fileId, 'pdf');
  }
  return rows.length;
}
