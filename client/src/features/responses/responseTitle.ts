import type { ResponseDto } from '@tu-registry/shared';
import { formatCalendarDate } from '@/shared/lib/format';

/** «№ 125/01-15 від 16.03.2026». */
export const titleOf = (response: ResponseDto) =>
  `№ ${response.outgoingNumber} від ${formatCalendarDate(response.responseDate)}`;
