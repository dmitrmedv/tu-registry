import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { allModels } from '../models';

/**
 * Brings database indexes in line with the schemas (creates missing, drops obsolete).
 * Used in production, where autoIndex is disabled.
 */
async function main() {
  await connectDb(env.MONGO_URI);
  try {
    for (const model of allModels) {
      const dropped = await model.syncIndexes();
      logger.info({ model: model.modelName, dropped }, 'Indexes synchronized');
    }
  } finally {
    await disconnectDb();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Index synchronization failed');
  process.exitCode = 1;
});
