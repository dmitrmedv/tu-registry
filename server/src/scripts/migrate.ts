import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { ensureInitialDepartments } from '../modules/departments/department.service';
import {
  assignDefaultDepartment,
  backfillAreaType,
  backfillObjectCategory,
  backfillProcessing,
  backfillSettlement,
  backfillTechnicalConditionsCustomer,
  dropYearWideUniqueNumberIndex,
  moveCadastralNumberIntoAddress,
  moveCountersToDefaultDepartment,
} from '../modules/applications/application.migration';

/** Data changes required by new schema rules. Safe to run repeatedly (and on every deploy). */
async function main() {
  await connectDb(env.MONGO_URI);
  try {
    // First: everything below may refer to the initial departments.
    const departments = await ensureInitialDepartments();
    logger.info({ departments }, 'Initial departments added');
    const categorized = await backfillObjectCategory();
    logger.info({ categorized }, 'Applications without a category set to OTHER');
    const settled = await backfillSettlement();
    logger.info({ settled }, 'Settlements moved out of addresses');
    const cadastral = await moveCadastralNumberIntoAddress();
    logger.info(cadastral, 'Cadastral numbers moved into addresses (skipped: address too long)');
    // After the settlements: the area type is derived from them.
    const areas = await backfillAreaType();
    logger.info({ areas }, 'Area types derived from settlements');
    const assigned = await assignDefaultDepartment();
    logger.info(assigned, 'Users and applications without a department set to Одеське');
    const counters = await moveCountersToDefaultDepartment();
    logger.info({ counters }, 'Year counters moved to Одеське');
    const droppedIndex = await dropYearWideUniqueNumberIndex();
    logger.info({ droppedIndex }, 'Year-wide unique number index dropped');
    const processing = await backfillProcessing();
    logger.info({ processing }, 'Processing summaries filled in');
    // After the settlements: the address of the conditions includes it.
    const tuCustomers = await backfillTechnicalConditionsCustomer();
    logger.info({ tuCustomers }, 'Technical conditions given the application customer and address');
  } finally {
    await disconnectDb();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Migration failed');
  process.exitCode = 1;
});
