import type { Types } from 'mongoose';
import { Project } from '../projects/project.model';
import type { ScanRecord } from '../documents/document.dto';
import { Estimate } from './estimate.model';

type OldProject = {
  _id: Types.ObjectId;
  applicationId: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  estimateCheckDate?: Date | null;
  estimateScan?: ScanRecord | null;
  estimateImd?: ScanRecord | null;
};

const OLD_FIELDS = ['estimateCheckDate', 'estimateScan', 'estimateImd'] as const;

/**
 * The estimate became a document of its own (2026-11-21): a project's check date and files move
 * to its first estimate; the files stay where they are on disk. Through the driver: the old fields
 * are no longer in the schema. A project with an estimate already is only cleaned up.
 */
export async function moveProjectEstimates() {
  const rows = await Project.collection
    .find({ $or: OLD_FIELDS.map((field) => ({ [field]: { $exists: true } })) })
    .project<OldProject>({ applicationId: 1, createdBy: 1, createdAt: 1, ...fieldsProjection() })
    .toArray();
  let moved = 0;
  for (const row of rows) {
    const hasData = Boolean(row.estimateCheckDate || row.estimateScan || row.estimateImd);
    if (hasData && !(await Estimate.exists({ projectId: row._id }))) {
      const at = row.estimateScan?.uploadedAt ?? row.estimateImd?.uploadedAt ?? row.createdAt;
      await Estimate.collection.insertOne({
        applicationId: row.applicationId,
        projectId: row._id,
        checkDate: row.estimateCheckDate ?? null,
        amountKopecks: null,
        ...(row.estimateScan && { scan: row.estimateScan }),
        ...(row.estimateImd && { imd: row.estimateImd }),
        active: true,
        createdBy: row.createdBy,
        version: 1,
        createdAt: at,
        updatedAt: at,
      });
      moved += 1;
    }
    await Project.collection.updateOne(
      { _id: row._id },
      { $unset: Object.fromEntries(OLD_FIELDS.map((field) => [field, ''])) },
    );
  }
  return moved;
}

function fieldsProjection() {
  return Object.fromEntries(OLD_FIELDS.map((field) => [field, 1]));
}
