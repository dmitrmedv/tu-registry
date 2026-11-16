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

function useTuMutation<TVariables, TResult>(
  applicationId: string,
  fn: (v: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: technicalConditionsKeys.list(applicationId) }),
  });
}

export const useCreateTechnicalConditions = (applicationId: string) =>
  useTuMutation(applicationId, (input: CreateTechnicalConditionsInput) =>
    api.create(applicationId, input),
  );

export const useUpdateTechnicalConditions = (applicationId: string) =>
  useTuMutation(
    applicationId,
    ({ id, input }: { id: string; input: UpdateTechnicalConditionsInput }) =>
      api.update(applicationId, id, input),
  );

export const useCancelTechnicalConditions = (applicationId: string) =>
  useTuMutation(applicationId, ({ id, input }: { id: string; input: CancelDocumentInput }) =>
    api.cancel(applicationId, id, input),
  );

export const useRestoreTechnicalConditions = (applicationId: string) =>
  useTuMutation(applicationId, ({ id, version }: { id: string; version: number }) =>
    api.restore(applicationId, id, version),
  );

export const useUploadTechnicalConditionsScan = (applicationId: string) =>
  useTuMutation(applicationId, ({ id, file }: { id: string; file: File }) =>
    api.uploadScan(applicationId, id, file),
  );
