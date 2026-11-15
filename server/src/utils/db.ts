import mongoose, { type ClientSession } from 'mongoose';

/** MongoDB unique index violation (E11000). */
export function isDuplicateKey(error: unknown): error is { keyPattern?: Record<string, unknown> } {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

/**
 * Runs `work` in a transaction; everything it writes with `session` commits together or not
 * at all. Transient conflicts (concurrent writers) are retried by the driver.
 */
export async function inTransaction<T>(work: (session: ClientSession) => Promise<T>) {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}
