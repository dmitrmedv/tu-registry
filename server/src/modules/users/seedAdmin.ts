import {
  DEFAULT_DEPARTMENT,
  type Department,
  departmentField,
  fullNameField,
  loginField,
  passwordField,
} from '@tu-registry/shared';
import { z } from 'zod';
import { hashPassword } from '../../utils/password';
import { AuditLog } from '../audit/auditLog.model';
import { User } from './user.model';

export type SeedAdminInput = {
  login: string;
  fullName: string;
  password: string;
  department: Department;
};

const seedEnvSchema = z.object({
  SEED_ADMIN_LOGIN: loginField,
  SEED_ADMIN_NAME: fullNameField,
  SEED_ADMIN_PASSWORD: passwordField,
  SEED_ADMIN_DEPARTMENT: departmentField.default(DEFAULT_DEPARTMENT),
});

/** The first administrator from SEED_ADMIN_* variables; throws a readable list of problems. */
export function seedAdminFromEnv(source: NodeJS.ProcessEnv): SeedAdminInput {
  const parsed = seedEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid seed variables:\n${z.prettifyError(parsed.error)}`);
  }
  const { SEED_ADMIN_LOGIN, SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD, SEED_ADMIN_DEPARTMENT } =
    parsed.data;
  return {
    login: SEED_ADMIN_LOGIN,
    fullName: SEED_ADMIN_NAME,
    password: SEED_ADMIN_PASSWORD,
    department: SEED_ADMIN_DEPARTMENT,
  };
}

/**
 * Creates the first administrator. Idempotent: does nothing if an active admin exists,
 * so it is safe to run on every deploy.
 */
export async function seedAdmin(input: SeedAdminInput): Promise<'created' | 'exists'> {
  if (await User.exists({ role: 'ADMIN', isActive: true })) return 'exists';

  const admin = await User.create({
    login: input.login,
    fullName: input.fullName,
    department: input.department,
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
