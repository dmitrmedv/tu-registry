import { formatRegNumber } from '@tu-registry/shared';
import { inTransaction } from '../../utils/db';
import { toIsoDate } from '../../utils/kyivDate';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import type { Actor } from './application.access';
import { loadApplication, versionConflict } from './application.edit.service';
import { Application } from './application.model';
import { ApplicationChange } from './applicationChange.model';

/**
 * Admin only (enforced by the route). Removes the application with its change history; the
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

  await inTransaction(async (session) => {
    const { deletedCount } = await Application.deleteOne(
      { _id: current._id, version },
      { session },
    );
    if (deletedCount === 0) throw versionConflict();
    await ApplicationChange.deleteMany({ applicationId: current._id }, { session });
    await recordAudit(
      {
        action: 'APPLICATION_DELETED',
        actor: actor.id,
        entityType: 'Application',
        entityId: current._id,
        details: {
          regNumber: formatRegNumber(current.regYear, current.regSeq, current.department),
          regDate: toIsoDate(current.regDate),
        },
      },
      context,
      session,
    );
  });
}
