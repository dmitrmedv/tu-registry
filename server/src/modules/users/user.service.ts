import type {
  CreateUserInput,
  UpdateUserInput,
  UserWithTemporaryPassword,
} from '@tu-registry/shared';
import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { isDuplicateKey } from '../../utils/db';
import { generateTemporaryPassword, hashPassword } from '../../utils/password';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { revokeAllSessions } from '../auth/session.service';
import { toUserDto } from './user.dto';
import { User } from './user.model';

type Actor = { id: string };

const userNotFound = () => ApiError.notFound('Користувача не знайдено');

export async function listUsers() {
  const users = await User.find().sort({ fullName: 1 });
  return users.map(toUserDto);
}

/** Everyone who ever registered applications, for the registry's "registered by" filter. */
export async function listUserOptions() {
  const users = await User.find().select('fullName isActive').sort({ fullName: 1 }).lean();
  return users.map((u) => ({ id: String(u._id), fullName: u.fullName, isActive: u.isActive }));
}

export async function createUser(
  input: CreateUserInput,
  actor: Actor,
  context: RequestContext,
): Promise<UserWithTemporaryPassword> {
  const temporaryPassword = generateTemporaryPassword();
  let user;
  try {
    user = await User.create({
      ...input,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw ApiError.conflict('Користувач з таким логіном уже існує');
    throw error;
  }

  await recordAudit(
    {
      action: 'USER_CREATED',
      actor: actor.id,
      entityType: 'User',
      entityId: user._id,
      details: {
        login: user.login,
        role: user.role,
        canManageRegistration: user.canManageRegistration,
      },
    },
    context,
  );
  // The temporary password is returned exactly once and never stored in plain text.
  return { user: toUserDto(user), temporaryPassword };
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: Actor,
  context: RequestContext,
) {
  const user = await User.findById(id);
  if (!user) throw userNotFound();

  // An admin cannot lock themselves out. Together with "only admins edit users" this also
  // guarantees at least one active administrator always remains.
  if (user.id === actor.id) {
    if (input.isActive === false) {
      throw new ApiError(
        409,
        'CANNOT_MODIFY_SELF',
        'Не можна деактивувати власний обліковий запис',
      );
    }
    if (input.role && input.role !== user.role) {
      throw new ApiError(409, 'CANNOT_MODIFY_SELF', 'Не можна змінити власну роль');
    }
  }

  const changes = (Object.keys(input) as (keyof UpdateUserInput)[])
    .filter((field) => input[field] !== undefined && input[field] !== user[field])
    .map((field) => ({ field, from: user[field], to: input[field] }));
  if (changes.length === 0) return toUserDto(user);

  user.set(input);
  await user.save();

  const deactivated = input.isActive === false && changes.some((c) => c.field === 'isActive');
  if (deactivated) await revokeAllSessions(user._id);

  await recordAudit(
    {
      action: deactivated ? 'USER_DEACTIVATED' : 'USER_UPDATED',
      actor: actor.id,
      entityType: 'User',
      entityId: user._id,
      details: { changes },
    },
    context,
  );
  return toUserDto(user);
}

export async function resetPassword(
  id: string,
  actor: Actor,
  context: RequestContext,
): Promise<UserWithTemporaryPassword> {
  const user = await User.findById(id);
  if (!user) throw userNotFound();

  const temporaryPassword = generateTemporaryPassword();
  user.passwordHash = await hashPassword(temporaryPassword);
  user.mustChangePassword = true;
  await user.save();
  await revokeAllSessions(user._id);

  await recordAudit(
    { action: 'PASSWORD_RESET', actor: actor.id, entityType: 'User', entityId: user._id },
    context,
  );
  return { user: toUserDto(user), temporaryPassword };
}

export type UserSummary = { id: string; fullName: string; login: string };

/** Names for ids referenced elsewhere (authors, actors); one query for any number of ids. */
export async function findUserSummaries(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const users = unique.length
    ? await User.find({ _id: mongoose.trusted({ $in: unique }) })
        .select('fullName login')
        .lean()
    : [];
  return new Map<string, UserSummary>(
    users.map((u) => [String(u._id), { id: String(u._id), fullName: u.fullName, login: u.login }]),
  );
}
