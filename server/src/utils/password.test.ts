import { describe, expect, it } from 'vitest';
import { env } from '../config/env';
import { generateTemporaryPassword, hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('hashes with bcrypt and verifies only the correct password', async () => {
    const hash = await hashPassword('s3cret-password');

    expect(hash.startsWith(`$2b$${String(env.BCRYPT_COST).padStart(2, '0')}$`)).toBe(true);
    expect(await verifyPassword('s3cret-password', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('generates distinct temporary passwords without look-alike characters', () => {
    const passwords = new Set(Array.from({ length: 50 }, generateTemporaryPassword));

    expect(passwords.size).toBe(50);
    for (const password of passwords) expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{14}$/);
  });
});
