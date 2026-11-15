import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationsApi } from './api';

export const applicationKeys = {
  all: ['applications'] as const,
  nextNumber: () => [...applicationKeys.all, 'next-number'] as const,
};

/** Changes whenever anyone registers an application, so it is never considered fresh. */
export function useNextNumber() {
  return useQuery({
    queryKey: applicationKeys.nextNumber(),
    queryFn: applicationsApi.nextNumber,
    staleTime: 0,
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applicationsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: applicationKeys.all }),
  });
}
