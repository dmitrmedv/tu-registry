import { type ApplicationDto, formatRegNumber } from '@tu-registry/shared';
import { toIsoDate } from '../../utils/kyivDate';
import type { Application } from './application.model';

export type ApplicationDocument = InstanceType<typeof Application>;
type Author = { id: string; fullName: string };

/** The only way an application leaves the server: an explicit list of fields. */
export function toApplicationDto(app: ApplicationDocument, author: Author): ApplicationDto {
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
    objectAddress: app.objectAddress,
    objectType: app.objectType,
    registrationMode: app.registrationMode,
    status: app.status,
    createdBy: author,
    createdAt: (app.get('createdAt') as Date).toISOString(),
    updatedAt: (app.get('updatedAt') as Date).toISOString(),
    version: app.version,
  };
}
