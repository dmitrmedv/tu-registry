import {
  type AnnulApplicationInput,
  type ApplicationChangeDto,
  formatRegNumber,
  OBJECT_CATEGORY_OTHER_REQUIRED,
  type UpdateApplicationData,
} from '@tu-registry/shared';
import { ApiError } from '../../utils/ApiError';
import { inTransaction, isDuplicateKey } from '../../utils/db';
import { fromIsoDate, toIsoDate } from '../../utils/kyivDate';
import { type RequestContext, recordAccessDenied, recordAudit } from '../audit/audit.service';
import { assertUsableDepartment, departmentCode } from '../departments/department.service';
import { findUserSummaries } from '../users/user.service';
import { type Actor, applicationNotFound, canAccess, isAdmin } from './application.access';
import { type ApplicationDocument, toApplicationDto } from './application.dto';
import { Application } from './application.model';
import { numberTaken, yearOf } from './application.service';
import { ApplicationChange } from './applicationChange.model';

type FieldChange = { field: string; oldValue: unknown; newValue: unknown };

const CONTENT_FIELDS = [
  'customer',
  'customerRepresentative',
  'phone',
  'email',
  'settlement',
  'objectAddress',
  'areaType',
  'objectType',
  'objectCategory',
  'objectCategoryOther',
  'comment',
] as const;

export const versionConflict = () =>
  new ApiError(
    409,
    'VERSION_CONFLICT',
    'Заяву щойно змінив інший користувач. Завантажте актуальні дані й повторіть зміни.',
  );

/** The application, if it exists and the actor's department may see it. */
export async function loadApplication(id: string, actor: Actor) {
  const app = await Application.findById(id);
  if (!app || !canAccess(app, actor)) throw applicationNotFound();
  return app;
}

/** Audits the refusal (outside any transaction, so it is kept) and returns the 403. */
async function deny(
  actor: Actor,
  app: ApplicationDocument,
  required: string,
  message: string,
  context: RequestContext,
) {
  await recordAccessDenied(actor.id, { applicationId: app.id as string, required }, context);
  return ApiError.forbidden(message);
}

async function toDto(app: ApplicationDocument) {
  const authorId = String(app.createdBy);
  const annulledById = app.annulment ? String(app.annulment.by) : null;
  const [names, code] = await Promise.all([
    findUserSummaries([authorId, annulledById]),
    departmentCode(app.department),
  ]);
  const name = (id: string) => ({ id, fullName: names.get(id)?.fullName ?? '—' });
  return toApplicationDto(app, code, name(authorId), annulledById ? name(annulledById) : null);
}

export async function getApplication(id: string, actor: Actor) {
  return toDto(await loadApplication(id, actor));
}

/**
 * Keeps the category and its wording consistent with what is stored: a category other than
 * OTHER clears the wording, and OTHER needs one (sent now or already saved). Records migrated
 * to OTHER without wording stay valid until someone touches the category.
 */
function withCategoryWording(input: UpdateApplicationData, current: ApplicationDocument) {
  if (input.objectCategory === undefined && input.objectCategoryOther === undefined) return input;
  const category = input.objectCategory ?? current.objectCategory;
  if (category !== 'OTHER') return { ...input, objectCategoryOther: null };
  const wording =
    input.objectCategoryOther !== undefined
      ? input.objectCategoryOther
      : (current.objectCategoryOther ?? null);
  if (!wording) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Некоректні дані', {
      formErrors: [],
      fieldErrors: { objectCategoryOther: [OBJECT_CATEGORY_OTHER_REQUIRED] },
    });
  }
  return input;
}

/**
 * Applies only the fields that actually changed. Content fields: anyone in the application's
 * department, or an admin. Date/number: an admin, or an "authorized" user of the department.
 * Department: admins only; the number then moves to it and must be free there. The number's
 * year always follows the registration date; the automatic counter is never touched.
 */
export async function updateApplication(
  id: string,
  input: UpdateApplicationData,
  actor: Actor,
  context: RequestContext,
) {
  const current = await loadApplication(id, actor);
  if (current.status === 'ANNULLED') {
    throw new ApiError(
      409,
      'APPLICATION_ANNULLED',
      'Анульовану заяву не можна редагувати. Спершу її має відновити адміністратор.',
    );
  }

  const touchesRegistration = input.regDate !== undefined || input.regSeq !== undefined;
  if (touchesRegistration && !isAdmin(actor) && !actor.canManageRegistration) {
    throw await deny(
      actor,
      current,
      'canManageRegistration',
      'Дату й номер можуть змінювати лише уповноважені користувачі',
      context,
    );
  }
  const newDepartment = input.department ?? current.department;
  if (newDepartment !== current.department) {
    if (!isAdmin(actor)) {
      throw await deny(actor, current, 'ADMIN', 'Управління заяви змінює адміністратор', context);
    }
    await assertUsableDepartment(newDepartment);
  }
  if (input.version !== current.version) throw versionConflict();

  const content = withCategoryWording(input, current);
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  const changes: FieldChange[] = [];

  for (const field of CONTENT_FIELDS) {
    const next = content[field];
    const previous = current[field] ?? null;
    if (next === undefined || next === previous) continue;
    changes.push({ field, oldValue: previous, newValue: next });
    if (next === null) unset[field] = 1;
    else set[field] = next;
  }

  const oldDate = toIsoDate(current.regDate);
  const newDate = input.regDate ?? oldDate;
  const [oldCode, newCode] = await Promise.all([
    departmentCode(current.department),
    departmentCode(newDepartment),
  ]);
  const oldNumber = formatRegNumber(current.regYear, current.regSeq, oldCode);
  const newYear = yearOf(newDate);
  const newSeq = input.regSeq ?? current.regSeq;
  const newNumber = formatRegNumber(newYear, newSeq, newCode);
  if (newDepartment !== current.department) {
    changes.push({ field: 'department', oldValue: current.department, newValue: newDepartment });
    set.department = newDepartment;
  }
  if (newDate !== oldDate) {
    changes.push({ field: 'regDate', oldValue: oldDate, newValue: newDate });
    set.regDate = fromIsoDate(newDate);
  }
  if (newNumber !== oldNumber) {
    changes.push({ field: 'regNumber', oldValue: oldNumber, newValue: newNumber });
    set.regYear = newYear;
    set.regSeq = newSeq;
  }
  if (changes.length === 0) return toDto(current);

  try {
    await inTransaction(async (session) => {
      if (newNumber !== oldNumber) {
        const holder = await Application.findOne({
          department: newDepartment,
          regYear: newYear,
          regSeq: newSeq,
        })
          .select('regDate')
          .session(session);
        if (holder) throw numberTaken(newNumber, holder.regDate);
      }
      // Matches only the version the user saw: a concurrent edit makes this a no-op.
      const { modifiedCount } = await Application.updateOne(
        { _id: current._id, version: input.version, status: 'ACTIVE' },
        {
          $set: { ...set, updatedBy: actor.id },
          ...(Object.keys(unset).length > 0 && { $unset: unset }),
          $inc: { version: 1 },
        },
        { session, runValidators: true },
      );
      if (modifiedCount === 0) throw versionConflict();

      await ApplicationChange.create(
        [{ applicationId: current._id, changedBy: actor.id, action: 'UPDATED', changes }],
        { session },
      );
      const audit = { actor: actor.id, entityType: 'Application' as const, entityId: current._id };
      if (newNumber !== oldNumber) {
        await recordAudit(
          { ...audit, action: 'REG_NUMBER_CHANGED', details: { from: oldNumber, to: newNumber } },
          context,
          session,
        );
      }
      if (newDate !== oldDate) {
        await recordAudit(
          {
            ...audit,
            action: 'REG_DATE_CHANGED',
            details: { regNumber: newNumber, from: oldDate, to: newDate },
          },
          context,
          session,
        );
      }
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw numberTaken(newNumber);
    throw error;
  }
  return getApplication(id, actor);
}

/** Anyone in the application's department, or an admin. The number stays taken. */
export async function annulApplication(
  id: string,
  { reason, version }: AnnulApplicationInput,
  actor: Actor,
  context: RequestContext,
) {
  const current = await loadApplication(id, actor);
  if (current.status === 'ANNULLED') {
    throw new ApiError(409, 'ALREADY_ANNULLED', 'Заяву вже анульовано');
  }
  if (version !== current.version) throw versionConflict();

  await inTransaction(async (session) => {
    const { modifiedCount } = await Application.updateOne(
      { _id: current._id, version, status: 'ACTIVE' },
      {
        $set: {
          status: 'ANNULLED',
          annulment: { reason, at: new Date(), by: actor.id },
          updatedBy: actor.id,
        },
        $inc: { version: 1 },
      },
      { session },
    );
    if (modifiedCount === 0) throw versionConflict();
    await ApplicationChange.create(
      [
        {
          applicationId: current._id,
          changedBy: actor.id,
          action: 'ANNULLED',
          changes: [
            { field: 'status', oldValue: 'ACTIVE', newValue: 'ANNULLED' },
            { field: 'annulmentReason', oldValue: null, newValue: reason },
          ],
        },
      ],
      { session },
    );
    await recordAudit(
      {
        action: 'APPLICATION_ANNULLED',
        actor: actor.id,
        entityType: 'Application',
        entityId: current._id,
        details: {
          regNumber: formatRegNumber(
            current.regYear,
            current.regSeq,
            await departmentCode(current.department),
          ),
        },
      },
      context,
      session,
    );
  });
  return getApplication(id, actor);
}

/** Admin only (enforced by the route). */
export async function restoreApplication(
  id: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const current = await loadApplication(id, actor);
  if (current.status !== 'ANNULLED') {
    throw new ApiError(409, 'NOT_ANNULLED', 'Заява не анульована');
  }
  if (version !== current.version) throw versionConflict();

  await inTransaction(async (session) => {
    const { modifiedCount } = await Application.updateOne(
      { _id: current._id, version, status: 'ANNULLED' },
      {
        $set: { status: 'ACTIVE', updatedBy: actor.id },
        $unset: { annulment: 1 },
        $inc: { version: 1 },
      },
      { session },
    );
    if (modifiedCount === 0) throw versionConflict();
    await ApplicationChange.create(
      [
        {
          applicationId: current._id,
          changedBy: actor.id,
          action: 'RESTORED',
          changes: [{ field: 'status', oldValue: 'ANNULLED', newValue: 'ACTIVE' }],
        },
      ],
      { session },
    );
    await recordAudit(
      {
        action: 'APPLICATION_RESTORED',
        actor: actor.id,
        entityType: 'Application',
        entityId: current._id,
        details: {
          regNumber: formatRegNumber(
            current.regYear,
            current.regSeq,
            await departmentCode(current.department),
          ),
        },
      },
      context,
      session,
    );
  });
  return getApplication(id, actor);
}

/** Every saved change, newest first, with the author's name. */
export async function getApplicationHistory(
  id: string,
  actor: Actor,
): Promise<ApplicationChangeDto[]> {
  await loadApplication(id, actor);
  const rows = await ApplicationChange.find({ applicationId: id })
    .sort({ changedAt: -1, _id: -1 })
    .lean();
  const names = await findUserSummaries(rows.map((row) => String(row.changedBy)));
  return rows.map((row) => ({
    id: String(row._id),
    action: row.action,
    changedAt: row.changedAt.toISOString(),
    changedBy: {
      id: String(row.changedBy),
      fullName: names.get(String(row.changedBy))?.fullName ?? '—',
    },
    changes: row.changes.map((change) => ({
      field: change.field,
      oldValue: change.oldValue ?? null,
      newValue: change.newValue ?? null,
    })),
  }));
}
