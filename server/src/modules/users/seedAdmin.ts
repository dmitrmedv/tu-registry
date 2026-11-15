import { hashPassword } from '../../utils/password';
import { AuditLog } from '../audit/auditLog.model';
import { User } from './user.model';

export type SeedAdminInput = { login: string; fullName: string; password: string };

/**
 * Creates the first administrator. Idempotent: does nothing if an active admin exists,
 * so it is safe to run on every deploy.
 */
export async function seedAdmin(input: SeedAdminInput): Promise<'created' | 'exists'> {
  if (await User.exists({ role: 'ADMIN', isActive: true })) return 'exists';

  const admin = await User.create({
    login: input.login,
    fullName: input.fullName,
    passwordHash: await hashPassword(input.password),
    role: 'ADMIN',
    canManageRegistration: true,
    mustChangePassword: true,
  });

  await AuditLog.create({
    actor: null,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: admin._id,
    details: { via: 'seed', role: 'ADMIN' },
  });

  return 'created';
}
