import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { backfillObjectCategory } from '../modules/applications/application.migration';

/** Data changes required by new schema rules. Safe to run repeatedly (and on every deploy). */
async function main() {
  await connectDb(env.MONGO_URI);
  try {
    const categorized = await backfillObjectCategory();
    logger.info({ categorized }, 'Applications without a category set to OTHER');
  } finally {
    await disconnectDb();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Migration failed');
  process.exitCode = 1;
});
