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

/** Is a manual number free? Runs only for a complete, valid date + number. */
export function useManualNumberCheck(params: { regDate: string; regSeq: number } | null) {
  return useQuery({
    queryKey: [...applicationKeys.all, 'manual-check', params] as const,
    queryFn: () => applicationsApi.checkManualNumber(params!),
    enabled: params !== null,
    staleTime: 0,
  });
}

function useApplicationsMutation<TVariables, TResult>(fn: (v: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: applicationKeys.all }),
  });
}

export const useCreateApplication = () => useApplicationsMutation(applicationsApi.create);
export const useCreateManualApplication = () =>
  useApplicationsMutation(applicationsApi.createManual);
