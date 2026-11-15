import mongoose from 'mongoose';
import { env } from './env';

mongoose.set('strictQuery', true);
// Defense in depth against query-selector injection: any object with `$` keys inside a
// filter is wrapped in `$eq`. Operators written in our own code must use mongoose.trusted().
mongoose.set('sanitizeFilter', true);

export async function connectDb(uri: string, options: { dbName?: string } = {}) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5_000,
    // In production indexes are created deliberately via `npm run db:indexes`.
    autoIndex: env.NODE_ENV !== 'production',
    ...options,
  });
  await assertReplicaSet();
}

/**
 * Registration numbering relies on multi-document transactions, which MongoDB
 * supports only on a replica set. Refuse to run on a standalone server.
 */
async function assertReplicaSet() {
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName) {
    await mongoose.disconnect();
    throw new Error(
      'MongoDB is not running as a replica set; transactions are required. See README.',
    );
  }
}

export function isDbConnected() {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export function disconnectDb() {
  return mongoose.disconnect();
}
