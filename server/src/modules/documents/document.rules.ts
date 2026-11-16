import { formatRegNumber } from '@tu-registry/shared';
import { ApiError } from '../../utils/ApiError';
import { kyivToday, toIsoDate } from '../../utils/kyivDate';
import type { ApplicationDocument } from '../applications/application.dto';
import { departmentCode } from '../departments/department.service';
import { Engineer } from '../engineers/engineer.model';

/** A 400 against one form field, in the shape the forms read. */
export function fieldError(field: string, message: string) {
  return new ApiError(400, 'VALIDATION_ERROR', message, {
    formErrors: [],
    fieldErrors: { [field]: [message] },
  });
}

export async function regNumberOf(app: ApplicationDocument) {
  return formatRegNumber(app.regYear, app.regSeq, await departmentCode(app.department));
}

/** Documents are dated between the registration and today (Kyiv). */
export function assertDocumentDate(
  app: ApplicationDocument,
  field: string,
  isoDate: string,
  label: string,
) {
  const regDate = toIsoDate(app.regDate);
  if (isoDate < regDate) {
    throw fieldError(
      field,
      `${label} не може бути раніше дати реєстрації заяви (${regDate.split('-').reverse().join('.')})`,
    );
  }
  if (isoDate > kyivToday().iso) throw fieldError(field, `${label} не може бути в майбутньому`);
}

/**
 * An active engineer of the application's department. `keep`: the engineer already chosen,
 * who stays valid after deactivation (editing other fields must not force a change).
 */
export async function resolveEngineer(app: ApplicationDocument, id: string, keep?: string) {
  const engineer = await Engineer.findById(id).lean();
  if (!engineer || engineer.department !== app.department) {
    throw fieldError('engineer', 'Оберіть інженера управління заяви');
  }
  if (!engineer.isActive && String(engineer._id) !== keep) {
    throw fieldError('engineer', 'Інженера деактивовано: оберіть іншого');
  }
  return engineer;
}
