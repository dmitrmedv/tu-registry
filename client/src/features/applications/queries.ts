import type {
  AnnulApplicationInput,
  Department,
  UpdateApplicationInput,
} from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationsApi, type ManualNumberCheckParams } from './api';

/** Every key starts with "applications", so one invalidation refreshes lists, cards and history. */
export const applicationKeys = {
  all: ['applications'] as const,
  nextNumber: (department: Department) =>
    [...applicationKeys.all, 'next-number', department] as const,
  detail: (id: string) => [...applicationKeys.all, 'detail', id] as const,
  history: (id: string) => [...applicationKeys.all, 'history', id] as const,
};

/** Changes whenever anyone registers an application, so it is never considered fresh. */
export function useNextNumber(department: Department) {
  return useQuery({
    queryKey: applicationKeys.nextNumber(department),
    queryFn: () => applicationsApi.nextNumber(department),
    staleTime: 0,
  });
}

/** Is a manual number free? Runs only for a complete, valid date + number. */
export function useManualNumberCheck(params: ManualNumberCheckParams | null) {
  return useQuery({
    queryKey: [...applicationKeys.all, 'manual-check', params] as const,
    queryFn: () => applicationsApi.checkManualNumber(params!),
    enabled: params !== null,
    staleTime: 0,
  });
}

export function useApplication(id: string) {
  return useQuery({ queryKey: applicationKeys.detail(id), queryFn: () => applicationsApi.get(id) });
}

export function useApplicationHistory(id: string) {
  return useQuery({
    queryKey: applicationKeys.history(id),
    queryFn: () => applicationsApi.history(id),
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
export const useUpdateApplication = (id: string) =>
  useApplicationsMutation((data: UpdateApplicationInput) => applicationsApi.update(id, data));
export const useAnnulApplication = (id: string) =>
  useApplicationsMutation((data: AnnulApplicationInput) => applicationsApi.annul(id, data));
export const useRestoreApplication = (id: string) =>
  useApplicationsMutation((version: number) => applicationsApi.restore(id, version));

export function useDeleteApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => applicationsApi.remove(id, version),
    // Marked stale without refetching: the open card would otherwise reload a deleted record
    // and flash "not found" before the page navigates away. Lists refetch when shown again.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: applicationKeys.all, refetchType: 'none' }),
  });
}
