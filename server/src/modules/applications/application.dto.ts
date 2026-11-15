import { type ApplicationDto, formatRegNumber } from '@tu-registry/shared';
import { toIsoDate } from '../../utils/kyivDate';
import type { Application } from './application.model';

export type ApplicationDocument = InstanceType<typeof Application>;
type Author = { id: string; fullName: string };

/** The only way an application leaves the server: an explicit list of fields. */
export function toApplicationDto(
  app: ApplicationDocument,
  author: Author,
  annulledBy: Author | null = null,
): ApplicationDto {
  return {
    id: app.id as string,
    regNumber: formatRegNumber(app.regYear, app.regSeq),
    regYear: app.regYear,
    regSeq: app.regSeq,
    regDate: toIsoDate(app.regDate),
    customer: app.customer,
    customerRepresentative: app.customerRepresentative ?? null,
    phone: app.phone,
    email: app.email ?? null,
    settlement: app.settlement ?? null,
    objectAddress: app.objectAddress,
    areaType: app.areaType ?? null,
    objectType: app.objectType,
    objectCategory: app.objectCategory,
    objectCategoryOther: app.objectCategoryOther ?? null,
    comment: app.comment ?? null,
    registrationMode: app.registrationMode,
    status: app.status,
    createdBy: author,
    annulment:
      app.annulment && annulledBy
        ? {
            reason: app.annulment.reason,
            at: app.annulment.at.toISOString(),
            by: annulledBy,
          }
        : null,
    createdAt: (app.get('createdAt') as Date).toISOString(),
    updatedAt: (app.get('updatedAt') as Date).toISOString(),
    version: app.version,
  };
}
