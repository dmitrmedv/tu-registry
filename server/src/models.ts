import { ApplicationChange } from './modules/applications/applicationChange.model';
import { Application } from './modules/applications/application.model';
import { AuditLog } from './modules/audit/auditLog.model';
import { CalendarDay } from './modules/calendar/calendarDay.model';
import { TechnicalConditions } from './modules/technicalConditions/technicalConditions.model';
import { TuPayment } from './modules/tuPayments/tuPayment.model';
import { ApplicationResponse } from './modules/responses/response.model';
import { Department } from './modules/departments/department.model';
import { Engineer } from './modules/engineers/engineer.model';
import { RefreshSession } from './modules/auth/refreshSession.model';
import { Counter } from './modules/numbering/counter.model';
import { User } from './modules/users/user.model';

/** Every model, for index synchronization and test setup. */
export const allModels = [
  Department,
  User,
  Engineer,
  CalendarDay,
  ApplicationResponse,
  TechnicalConditions,
  TuPayment,
  Application,
  ApplicationChange,
  Counter,
  AuditLog,
  RefreshSession,
] as const;
