import { dayOffMessage, isWorkingDate, type UpdateCalendarDayInput } from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { calendarApi } from './api';

export const calendarKeys = {
  all: ['calendar'] as const,
  year: (year: number) => [...calendarKeys.all, year] as const,
};

export function useCalendarDays(year: number) {
  return useQuery({ queryKey: calendarKeys.year(year), queryFn: () => calendarApi.list(year) });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The error of a date picked on a day off by the administrator's calendar (2026-11-22), shown
 * as soon as it is picked; the server refuses it with the same words.
 */
export function useDayOff() {
  const { data } = useQuery({
    queryKey: [...calendarKeys.all, 'exceptions'] as const,
    queryFn: calendarApi.exceptions,
    staleTime: 5 * 60_000,
  });
  return useCallback(
    (isoDate: unknown) => {
      if (!data || typeof isoDate !== 'string' || !ISO_DATE.test(isoDate)) return undefined;
      const exception = data.find((day) => day.date === isoDate)?.kind;
      return isWorkingDate(isoDate, exception) ? undefined : dayOffMessage(isoDate);
    },
    [data],
  );
}

function useCalendarMutation<TVariables, TResult>(fn: (v: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Deadlines shown with applications follow the calendar.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: calendarKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
      ]),
  });
}

export const useCreateCalendarDay = () => useCalendarMutation(calendarApi.create);
export const useUpdateCalendarDay = () =>
  useCalendarMutation(({ date, input }: { date: string; input: UpdateCalendarDayInput }) =>
    calendarApi.update(date, input),
  );
export const useDeleteCalendarDay = () => useCalendarMutation(calendarApi.remove);
