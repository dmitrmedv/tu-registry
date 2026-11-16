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

function useResponseMutation<TVariables, TResult>(
  applicationId: string,
  fn: (v: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: responseKeys.list(applicationId) }),
  });
}

export const useCreateResponse = (applicationId: string) =>
  useResponseMutation(applicationId, (input: CreateResponseInput) =>
    responsesApi.create(applicationId, input),
  );

export const useUpdateResponse = (applicationId: string) =>
  useResponseMutation(applicationId, ({ id, input }: { id: string; input: UpdateResponseInput }) =>
    responsesApi.update(applicationId, id, input),
  );

export const useCancelResponse = (applicationId: string) =>
  useResponseMutation(applicationId, ({ id, input }: { id: string; input: CancelDocumentInput }) =>
    responsesApi.cancel(applicationId, id, input),
  );

export const useRestoreResponse = (applicationId: string) =>
  useResponseMutation(applicationId, ({ id, version }: { id: string; version: number }) =>
    responsesApi.restore(applicationId, id, version),
  );

export const useUploadResponseScan = (applicationId: string) =>
  useResponseMutation(applicationId, ({ id, file }: { id: string; file: File }) =>
    responsesApi.uploadScan(applicationId, id, file),
  );
