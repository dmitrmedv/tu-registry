import {
  type CreateDepartmentInput,
  type Department as DepartmentId,
  type DepartmentAdminDto,
  type DepartmentDto,
  INITIAL_DEPARTMENTS,
  type UpdateDepartmentInput,
} from '@tu-registry/shared';
import mongoose, { Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { isDuplicateKey } from '../../utils/db';
import { Application } from '../applications/application.model';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { Counter } from '../numbering/counter.model';
import { User } from '../users/user.model';
import { Department } from './department.model';

type Actor = { id: string };
type DepartmentDoc = { _id: string; name: string; code: number; archived?: boolean | null };

const toDto = (department: DepartmentDoc): DepartmentDto => ({
  id: department._id,
  name: department.name,
  code: department.code,
  archived: Boolean(department.archived),
});

const departmentNotFound = () => ApiError.notFound('Управління не знайдено');

function fieldError(field: string, message: string, status = 400) {
  return new ApiError(status, status === 409 ? 'CONFLICT' : 'VALIDATION_ERROR', message, {
    formErrors: [],
    fieldErrors: { [field]: [message] },
  });
}

/** Adds the departments that existed before they became editable. Idempotent. */
export async function ensureInitialDepartments() {
  const { upsertedCount } = await Department.bulkWrite(
    INITIAL_DEPARTMENTS.map(({ id, name, code }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $setOnInsert: { _id: id, name, code, archived: false } },
        upsert: true,
      },
    })),
  );
  return upsertedCount;
}

export async function listDepartments(): Promise<DepartmentDto[]> {
  const rows = await Department.find().sort({ code: 1 }).lean<DepartmentDoc[]>();
  return rows.map(toDto);
}

/** For the admin page: how many users and applications each department has. */
export async function listDepartmentsWithCounts(): Promise<DepartmentAdminDto[]> {
  const count = async (model: typeof User | typeof Application) =>
    new Map(
      (
        await model.aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$department', count: { $sum: 1 } } },
        ])
      ).map((row) => [row._id, row.count]),
    );
  const [departments, users, applications] = await Promise.all([
    listDepartments(),
    count(User),
    count(Application),
  ]);
  return departments.map((department) => ({
    ...department,
    usersCount: users.get(department.id) ?? 0,
    applicationsCount: applications.get(department.id) ?? 0,
  }));
}

/** Every department by id, for formatting numbers and names in bulk. A handful of documents. */
export async function departmentDirectory() {
  return new Map((await listDepartments()).map((department) => [department.id, department]));
}

/** The code that goes into the numbers of `id`'s applications. */
export async function departmentCode(id: DepartmentId) {
  const department = await Department.findById(id).select('code').lean<DepartmentDoc>();
  if (!department) throw fieldError('department', 'Такого управління немає');
  return department.code;
}

export async function departmentIdByCode(code: number) {
  const department = await Department.findOne({ code }).select('_id').lean<DepartmentDoc>();
  return department?._id ?? null;
}

/**
 * Something new is about to go into `id` (a user, a registration, a moved application): it
 * must exist and not be archived. Reported against the request's `field`.
 */
export async function assertUsableDepartment(id: DepartmentId, field = 'department') {
  const department = await Department.findById(id).select('archived').lean<DepartmentDoc>();
  if (!department) throw fieldError(field, 'Такого управління немає');
  if (department.archived) throw fieldError(field, 'Управління в архіві');
}

/** E11000 on the name or the code: which one, in words the admin understands. */
function duplicate(error: unknown) {
  const pattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  return 'code' in pattern
    ? fieldError('code', 'Цей код уже має інше управління', 409)
    : fieldError('name', 'Управління з такою назвою вже є', 409);
}

export async function createDepartment(
  input: CreateDepartmentInput,
  actor: Actor,
  context: RequestContext,
) {
  const { name, code } = input as { name: string; code: number };
  let created;
  try {
    created = await Department.create({ _id: new Types.ObjectId().toHexString(), name, code });
  } catch (error) {
    if (isDuplicateKey(error)) throw duplicate(error);
    throw error;
  }
  await recordAudit(
    {
      action: 'DEPARTMENT_CREATED',
      actor: actor.id,
      entityType: 'Department',
      entityId: created._id,
      details: { name, code },
    },
    context,
  );
  return toDto(created.toObject());
}

/** Renaming or re-coding: numbers of its applications show the new code from now on. */
export async function updateDepartment(
  id: DepartmentId,
  input: UpdateDepartmentInput,
  actor: Actor,
  context: RequestContext,
) {
  const department = await Department.findById(id);
  if (!department) throw departmentNotFound();
  const next = input as { name?: string; code?: number };
  const changes = (['name', 'code'] as const)
    .filter((field) => next[field] !== undefined && next[field] !== department[field])
    .map((field) => ({ field, from: department[field], to: next[field] }));
  if (changes.length === 0) return toDto(department.toObject());

  department.set(Object.fromEntries(changes.map((change) => [change.field, change.to])));
  try {
    await department.save();
  } catch (error) {
    if (isDuplicateKey(error)) throw duplicate(error);
    throw error;
  }
  await recordAudit(
    {
      action: 'DEPARTMENT_UPDATED',
      actor: actor.id,
      entityType: 'Department',
      entityId: id,
      details: { name: department.name, changes },
    },
    context,
  );
  return toDto(department.toObject());
}

/** Archived or back: nothing new may go into an archived department, the rest stays. */
export async function setArchived(
  id: DepartmentId,
  archived: boolean,
  actor: Actor,
  context: RequestContext,
) {
  const department = await Department.findById(id);
  if (!department) throw departmentNotFound();
  if (department.archived !== archived) {
    department.archived = archived;
    await department.save();
    await recordAudit(
      {
        action: archived ? 'DEPARTMENT_ARCHIVED' : 'DEPARTMENT_RESTORED',
        actor: actor.id,
        entityType: 'Department',
        entityId: id,
        details: { name: department.name, code: department.code },
      },
      context,
    );
  }
  return toDto(department.toObject());
}

/**
 * Only an empty department is deleted for good (with its counters); one with users or
 * applications must be archived instead, so nothing points to a missing department.
 */
export async function deleteDepartment(id: DepartmentId, actor: Actor, context: RequestContext) {
  const department = await Department.findById(id);
  if (!department) throw departmentNotFound();
  const [users, applications] = await Promise.all([
    User.countDocuments({ department: id }),
    Application.countDocuments({ department: id }),
  ]);
  if (users > 0 || applications > 0) {
    throw new ApiError(
      409,
      'DEPARTMENT_IN_USE',
      `В управлінні є користувачі (${users}) або заяви (${applications}): його можна лише архівувати`,
      { users, applications },
    );
  }
  await Department.deleteOne({ _id: id });
  // Counter ids are "<year>:<department id>"; the id has only [A-Za-z0-9_].
  await Counter.deleteMany({ _id: mongoose.trusted({ $regex: `^\\d+:${id}$` }) });
  await recordAudit(
    {
      action: 'DEPARTMENT_DELETED',
      actor: actor.id,
      entityType: 'Department',
      entityId: id,
      details: { name: department.name, code: department.code },
    },
    context,
  );
}
