import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('hashes with bcrypt and verifies only the correct password', async () => {
    const hash = await hashPassword('s3cret-password');

    expect(hash).toMatch(/^\$2b\$12\$/);
    expect(await verifyPassword('s3cret-password', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});
