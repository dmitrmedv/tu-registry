import type {
  CalendarDayDto,
  CalendarExceptionDto,
  CreateCalendarDayInput,
  UpdateCalendarDayInput,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';

export const calendarApi = {
  /** Every exception, for every user: the dates typed in the forms are checked with them. */
  exceptions: () => http.get<CalendarExceptionDto[]>('/calendar/exceptions').then((r) => r.data),
  list: (year: number) =>
    http.get<CalendarDayDto[]>('/calendar', { params: { year } }).then((r) => r.data),
  create: (input: CreateCalendarDayInput) =>
    http.post<CalendarDayDto>('/calendar', input).then((r) => r.data),
  update: (date: string, input: UpdateCalendarDayInput) =>
    http.patch<CalendarDayDto>(`/calendar/${date}`, input).then((r) => r.data),
  remove: async (date: string) => {
    await http.delete(`/calendar/${date}`);
  },
};
