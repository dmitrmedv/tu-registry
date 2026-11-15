import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db';
import { verifyPassword } from '../../utils/password';
import { AuditLog } from '../audit/auditLog.model';
import { seedAdmin } from './seedAdmin';
import { User } from './user.model';

const input = {
  login: 'admin',
  fullName: 'Адміністратор',
  password: 'correct-horse-battery',
  department: 'ODESA' as const,
};

describe('seedAdmin', () => {
  useTestDb();

  it('creates an administrator with a hashed password and an audit entry', async () => {
    expect(await seedAdmin(input)).toBe('created');

    const admin = await User.findOne({ login: 'admin' }).select('+passwordHash');
    expect(admin).toMatchObject({
      role: 'ADMIN',
      canManageRegistration: true,
      mustChangePassword: true,
      isActive: true,
    });
    expect(admin!.passwordHash).not.toBe(input.password);
    expect(await verifyPassword(input.password, admin!.passwordHash)).toBe(true);

    const audit = await AuditLog.findOne({ action: 'USER_CREATED', entityId: admin!._id });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).not.toContain(input.password);
  });

  it('is idempotent', async () => {
    await seedAdmin(input);

    expect(await seedAdmin({ ...input, login: 'another' })).toBe('exists');
    expect(await User.countDocuments()).toBe(1);
  });
});
