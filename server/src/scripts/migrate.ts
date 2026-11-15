import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  assignDefaultDepartment,
  backfillAreaType,
  backfillObjectCategory,
  backfillSettlement,
  dropYearWideUniqueNumberIndex,
  moveCadastralNumberIntoAddress,
  moveCountersToDefaultDepartment,
} from '../modules/applications/application.migration';

/** Data changes required by new schema rules. Safe to run repeatedly (and on every deploy). */
async function main() {
  await connectDb(env.MONGO_URI);
  try {
    const categorized = await backfillObjectCategory();
    logger.info({ categorized }, 'Applications without a category set to OTHER');
    const settled = await backfillSettlement();
    logger.info({ settled }, 'Settlements moved out of addresses');
    const cadastral = await moveCadastralNumberIntoAddress();
    logger.info(cadastral, 'Cadastral numbers moved into addresses (skipped: address too long)');
    // After the settlements: the area type is derived from them.
    const areas = await backfillAreaType();
    logger.info({ areas }, 'Area types derived from settlements');
    const departments = await assignDefaultDepartment();
    logger.info(departments, 'Users and applications without a department set to Одеське');
    const counters = await moveCountersToDefaultDepartment();
    logger.info({ counters }, 'Year counters moved to Одеське');
    const droppedIndex = await dropYearWideUniqueNumberIndex();
    logger.info({ droppedIndex }, 'Year-wide unique number index dropped');
  } finally {
    await disconnectDb();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Migration failed');
  process.exitCode = 1;
});
