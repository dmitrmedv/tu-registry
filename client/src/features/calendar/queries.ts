import type { UpdateCalendarDayInput } from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calendarApi } from './api';

export const calendarKeys = {
  all: ['calendar'] as const,
  year: (year: number) => [...calendarKeys.all, year] as const,
};

export function useCalendarDays(year: number) {
  return useQuery({ queryKey: calendarKeys.year(year), queryFn: () => calendarApi.list(year) });
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
