import type {
  CreateEstimateInput,
  EstimateFileKind,
  UpdateEstimateInput,
} from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { estimatesApi as api } from './api';

/** Under the application's key: whatever refreshes the application refreshes these too. */
export const estimatesKeys = {
  list: (applicationId: string) => ['applications', applicationId, 'estimates'] as const,
};

export function useEstimates(applicationId: string) {
  return useQuery({
    queryKey: estimatesKeys.list(applicationId),
    queryFn: () => api.list(applicationId),
  });
}

function useEstimateMutation<TVariables, TResult>(fn: (v: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // The application's history follows its documents.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}

export const useCreateEstimate = (applicationId: string) =>
  useEstimateMutation((input: CreateEstimateInput) => api.create(applicationId, input));

export const useUpdateEstimate = (applicationId: string) =>
  useEstimateMutation(({ id, input }: { id: string; input: UpdateEstimateInput }) =>
    api.update(applicationId, id, input),
  );

export const useDeleteEstimate = (applicationId: string) =>
  useEstimateMutation(({ id, version }: { id: string; version: number }) =>
    api.remove(applicationId, id, version),
  );

export const useUploadEstimateFile = (applicationId: string) =>
  useEstimateMutation(
    ({
      id,
      kind,
      file,
      onProgress,
    }: {
      id: string;
      kind: EstimateFileKind;
      file: File;
      onProgress?: (p: number) => void;
    }) => api.uploadFile(applicationId, id, kind, file, onProgress),
  );

export const useRemoveEstimateFile = (applicationId: string) =>
  useEstimateMutation(({ id, kind }: { id: string; kind: EstimateFileKind }) =>
    api.removeFile(applicationId, id, kind),
  );
