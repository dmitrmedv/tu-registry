import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db';
import { User } from './user.model';

describe('User model', () => {
  useTestDb();

  const base = { fullName: 'Іван Петренко', passwordHash: 'hash' };

  it('normalizes login and applies safe defaults', async () => {
    const user = await User.create({ ...base, login: '  Ivan.Petrenko ' });

    expect(user.login).toBe('ivan.petrenko');
    expect(user.role).toBe('USER');
    expect(user.canManageRegistration).toBe(false);
    expect(user.isActive).toBe(true);
    expect(user.mustChangePassword).toBe(true);
  });

  it('rejects a duplicate login regardless of case', async () => {
    await User.create({ ...base, login: 'ivan' });

    await expect(User.create({ ...base, login: 'IVAN' })).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects logins with unsupported characters', async () => {
    await expect(User.create({ ...base, login: 'іван петренко' })).rejects.toThrow(/login/);
  });

  it('never exposes passwordHash', async () => {
    const { _id } = await User.create({ ...base, login: 'ivan' });

    const byDefault = await User.findById(_id);
    expect(byDefault?.passwordHash).toBeUndefined();

    const explicit = await User.findById(_id).select('+passwordHash');
    expect(explicit?.passwordHash).toBe('hash');

    const json = explicit!.toJSON() as Record<string, unknown>;
    expect(json).not.toHaveProperty('passwordHash');
    expect(json).not.toHaveProperty('_id');
    expect(json.id).toBe(String(_id));
  });
});
