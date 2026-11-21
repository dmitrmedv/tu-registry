import { formatRegNumber } from '@tu-registry/shared';
import { inTransaction } from '../../utils/db';
import { toIsoDate } from '../../utils/kyivDate';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { contractFiles } from '../contracts/contract.dto';
import { Contract } from '../contracts/contract.model';
import { departmentCode } from '../departments/department.service';
import { documentFileIds } from '../documents/document.dto';
import { PAYMENT_FILE_FIELDS, paymentFiles } from '../tuPayments/tuPayment.dto';
import { TuPayment } from '../tuPayments/tuPayment.model';
import { ApplicationResponse } from '../responses/response.model';
import { TechnicalConditions } from '../technicalConditions/technicalConditions.model';
import { deleteScanFile, deleteStoredFile } from '../scans/scan.storage';
import type { Actor } from './application.access';
import { loadApplication, versionConflict } from './application.edit.service';
import { Application } from './application.model';
import { ApplicationChange } from './applicationChange.model';

/**
 * Admin only (enforced by the route). Removes the application with its change history and
 * its responses, technical conditions, payments and contracts (with every file they ever had); the
 * number becomes free for manual entry (the automatic counter never goes back). The audit
 * entry keeps the number and date only — customer data does not belong in the audit log.
 */
export async function deleteApplication(
  id: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const current = await loadApplication(id, actor);
  if (version !== current.version) throw versionConflict();
  const code = await departmentCode(current.department);
  // Every document of the application, for their files (all versions) after the commit.
  const byApplication = { applicationId: current._id };
  const documents = [
    ...(await ApplicationResponse.find(byApplication).select('scan previousScans').lean()),
    ...(await TechnicalConditions.find(byApplication).select('scan previousScans').lean()),
  ];
  const payments = await TuPayment.find(byApplication).select(PAYMENT_FILE_FIELDS).lean();
  const contracts = await Contract.find(byApplication).select('document scan').lean();
  const files = [...(current.scan ? [current.scan.fileId] : []), ...documentFileIds(documents)];

  await inTransaction(async (session) => {
    const { deletedCount } = await Application.deleteOne(
      { _id: current._id, version },
      { session },
    );
    if (deletedCount === 0) throw versionConflict();
    await ApplicationChange.deleteMany({ applicationId: current._id }, { session });
    await ApplicationResponse.deleteMany({ applicationId: current._id }, { session });
    await TechnicalConditions.deleteMany({ applicationId: current._id }, { session });
    await TuPayment.deleteMany({ applicationId: current._id }, { session });
    await Contract.deleteMany({ applicationId: current._id }, { session });
    await recordAudit(
      {
        action: 'APPLICATION_DELETED',
        actor: actor.id,
        entityType: 'Application',
        entityId: current._id,
        details: {
          regNumber: formatRegNumber(current.regYear, current.regSeq, code),
          regDate: toIsoDate(current.regDate),
        },
      },
      context,
      session,
    );
  });
  // After the commit: a failed deletion must not lose the files of a still existing application.
  await Promise.all([
    ...files.map(deleteScanFile),
    ...[...paymentFiles(payments), ...contractFiles(contracts)].map(({ fileId, type }) =>
      deleteStoredFile(fileId, type),
    ),
  ]);
}
