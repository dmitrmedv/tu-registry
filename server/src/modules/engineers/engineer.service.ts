import type {
  CreateEngineerInput,
  Department,
  EngineerDto,
  UpdateEngineerInput,
} from '@tu-registry/shared';
import type { AuthUser } from '../../types/express';
import { ApiError } from '../../utils/ApiError';
import { isDuplicateKey } from '../../utils/db';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { assertUsableDepartment } from '../departments/department.service';
import { Engineer } from './engineer.model';

type Actor = Pick<AuthUser, 'id' | 'role' | 'department'>;
type EngineerDoc = { _id: unknown; fullName: string; department: string; isActive: boolean };

const BY_NAME = { locale: 'uk', strength: 2 } as const;

const toDto = (engineer: EngineerDoc): EngineerDto => ({
  id: String(engineer._id),
  fullName: engineer.fullName,
  department: engineer.department,
  isActive: engineer.isActive,
});

const duplicateName = () =>
  new ApiError(409, 'CONFLICT', 'Інженер з таким ПІБ в управлінні вже є', {
    formErrors: [],
    fieldErrors: { fullName: ['Інженер з таким ПІБ в управлінні вже є'] },
  });

/** A user sees their department's engineers only, whatever they ask for; an admin any. */
export async function listEngineers(
  actor: Pick<Actor, 'role' | 'department'>,
  query: { department?: Department; active?: 'true' | 'false' },
) {
  const department = actor.role === 'ADMIN' ? query.department : actor.department;
  const rows = await Engineer.find({
    ...(department && { department }),
    ...(query.active && { isActive: query.active === 'true' }),
  })
    .collation(BY_NAME)
    .sort({ department: 1, fullName: 1 })
    .lean<EngineerDoc[]>();
  return rows.map(toDto);
}

export async function createEngineer(
  input: CreateEngineerInput,
  actor: Actor,
  context: RequestContext,
) {
  const { fullName, department } = input as { fullName: string; department: Department };
  await assertUsableDepartment(department);
  let created;
  try {
    created = await Engineer.create({ fullName, department, createdBy: actor.id });
  } catch (error) {
    if (isDuplicateKey(error)) throw duplicateName();
    throw error;
  }
  await recordAudit(
    {
      action: 'ENGINEER_CREATED',
      actor: actor.id,
      entityType: 'Engineer',
      entityId: created._id,
      details: { fullName, department },
    },
    context,
  );
  return toDto(created.toObject());
}

/** Renaming, deactivating or activating again. Documents already naming them are not touched. */
export async function updateEngineer(
  id: string,
  input: UpdateEngineerInput,
  actor: Actor,
  context: RequestContext,
) {
  const engineer = await Engineer.findById(id);
  if (!engineer) throw ApiError.notFound('Інженера не знайдено');
  const next = input as { fullName?: string; isActive?: boolean };
  const changes = (['fullName', 'isActive'] as const)
    .filter((field) => next[field] !== undefined && next[field] !== engineer[field])
    .map((field) => ({ field, from: engineer[field], to: next[field] }));
  if (changes.length === 0) return toDto(engineer.toObject());

  engineer.set({ ...Object.fromEntries(changes.map((c) => [c.field, c.to])), updatedBy: actor.id });
  try {
    await engineer.save();
  } catch (error) {
    if (isDuplicateKey(error)) throw duplicateName();
    throw error;
  }
  const deactivated = changes.some((c) => c.field === 'isActive' && c.to === false);
  await recordAudit(
    {
      action: deactivated ? 'ENGINEER_DEACTIVATED' : 'ENGINEER_UPDATED',
      actor: actor.id,
      entityType: 'Engineer',
      entityId: engineer._id,
      details: { fullName: engineer.fullName, department: engineer.department, changes },
    },
    context,
  );
  return toDto(engineer.toObject());
}
