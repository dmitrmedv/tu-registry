import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

// Hashing is an explicit call in services rather than a pre('save') hook: hooks are
// skipped by updateOne()/findOneAndUpdate() and make double hashing easy to miss.
export function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}
