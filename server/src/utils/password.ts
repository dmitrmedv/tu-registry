import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../config/env';

// Hashing is an explicit call in services rather than a pre('save') hook: hooks are
// skipped by updateOne()/findOneAndUpdate() and make double hashing easy to miss.
export function hashPassword(plain: string) {
  return bcrypt.hash(plain, env.BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

// No look-alike characters (0/O, 1/l/I) so a password read aloud or retyped stays correct.
const TEMP_PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TEMP_PASSWORD_LENGTH = 14;

/** One-time password issued by an administrator; the user must change it on first login. */
export function generateTemporaryPassword() {
  let password = '';
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    password += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return password;
}
