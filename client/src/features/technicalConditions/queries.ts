import type {
  CancelDocumentInput,
  CreateTechnicalConditionsInput,
  UpdateTechnicalConditionsInput,
} from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { technicalConditionsApi as api } from './api';

/** Under the application's key: whatever refreshes the application refreshes these too. */
export const technicalConditionsKeys = {
  list: (applicationId: string) => ['applications', applicationId, 'technical-conditions'] as const,
};

export function useTechnicalConditions(applicationId: string) {
  return useQuery({
    queryKey: technicalConditionsKeys.list(applicationId),
    queryFn: () => api.list(applicationId),
  });
}

function useTuMutation<TVariables, TResult>(fn: (v: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // The application's stage, timeline and registry row follow its documents.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}

export const useCreateTechnicalConditions = (applicationId: string) =>
  useTuMutation((input: CreateTechnicalConditionsInput) => api.create(applicationId, input));

export const useUpdateTechnicalConditions = (applicationId: string) =>
  useTuMutation(({ id, input }: { id: string; input: UpdateTechnicalConditionsInput }) =>
    api.update(applicationId, id, input),
  );

export const useCancelTechnicalConditions = (applicationId: string) =>
  useTuMutation(({ id, input }: { id: string; input: CancelDocumentInput }) =>
    api.cancel(applicationId, id, input),
  );

export const useRestoreTechnicalConditions = (applicationId: string) =>
  useTuMutation(({ id, version }: { id: string; version: number }) =>
    api.restore(applicationId, id, version),
  );

export const useDeleteTechnicalConditions = (applicationId: string) =>
  useTuMutation(({ id, version }: { id: string; version: number }) =>
    api.remove(applicationId, id, version),
  );

export const useRemoveTechnicalConditionsScan = (applicationId: string) =>
  useTuMutation((id: string) => api.removeScan(applicationId, id));

export const useUploadTechnicalConditionsScan = (applicationId: string) =>
  useTuMutation(({ id, file }: { id: string; file: File }) =>
    api.uploadScan(applicationId, id, file),
  );
