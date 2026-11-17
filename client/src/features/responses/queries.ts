import type {
  CancelDocumentInput,
  CreateResponseInput,
  UpdateResponseInput,
} from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { responsesApi } from './api';

/** Under the application's key: whatever refreshes the application refreshes these too. */
export const responseKeys = {
  list: (applicationId: string) => ['applications', applicationId, 'responses'] as const,
};

export function useResponses(applicationId: string) {
  return useQuery({
    queryKey: responseKeys.list(applicationId),
    queryFn: () => responsesApi.list(applicationId),
  });
}

function useResponseMutation<TVariables, TResult>(fn: (v: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // The application's stage, timeline and registry row follow its documents.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}

export const useCreateResponse = (applicationId: string) =>
  useResponseMutation((input: CreateResponseInput) => responsesApi.create(applicationId, input));

export const useUpdateResponse = (applicationId: string) =>
  useResponseMutation(({ id, input }: { id: string; input: UpdateResponseInput }) =>
    responsesApi.update(applicationId, id, input),
  );

export const useCancelResponse = (applicationId: string) =>
  useResponseMutation(({ id, input }: { id: string; input: CancelDocumentInput }) =>
    responsesApi.cancel(applicationId, id, input),
  );

export const useRestoreResponse = (applicationId: string) =>
  useResponseMutation(({ id, version }: { id: string; version: number }) =>
    responsesApi.restore(applicationId, id, version),
  );

export const useDeleteResponse = (applicationId: string) =>
  useResponseMutation(({ id, version }: { id: string; version: number }) =>
    responsesApi.remove(applicationId, id, version),
  );

export const useRemoveResponseScan = (applicationId: string) =>
  useResponseMutation((id: string) => responsesApi.removeScan(applicationId, id));

export const useUploadResponseScan = (applicationId: string) =>
  useResponseMutation(({ id, file }: { id: string; file: File }) =>
    responsesApi.uploadScan(applicationId, id, file),
  );
