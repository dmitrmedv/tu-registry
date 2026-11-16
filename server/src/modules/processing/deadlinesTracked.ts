import { env } from '../../config/env';
import { toIsoDate } from '../../utils/kyivDate';

/**
 * Deadlines of applications registered before PROCESSING_START_DATE were not tracked when they
 * were processed: their numbers are shown, but no overdue warnings (decision 28).
 */
export const deadlinesTracked = (regDate: Date) =>
  !env.PROCESSING_START_DATE || toIsoDate(regDate) >= env.PROCESSING_START_DATE;
