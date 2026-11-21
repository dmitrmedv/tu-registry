import type { CancelDocumentInput, ContractFileKind, SaveContractInput } from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contractsApi as api } from './api';

/** Under the application's key: whatever refreshes the application refreshes these too. */
export const contractsKeys = {
  list: (applicationId: string) => ['applications', applicationId, 'contracts'] as const,
  draft: (applicationId: string, department?: string) =>
    ['applications', applicationId, 'contracts', 'draft', department ?? null] as const,
};

export function useContracts(applicationId: string) {
  return useQuery({
    queryKey: contractsKeys.list(applicationId),
    queryFn: () => api.list(applicationId),
  });
}

/**
 * The new contract's starting values, fetched afresh on every visit of the page: the form is
 * built from the first answer, and a cached one may be stale (another contract added since).
 */
export function useContractDraft(applicationId: string) {
  return useQuery({
    queryKey: contractsKeys.draft(applicationId),
    queryFn: () => api.draft(applicationId),
    gcTime: 0,
  });
}

function useContractMutation<TVariables, TResult>(fn: (v: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // The card's tabs, history and the next number follow the contracts.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}

export const useCreateContract = (applicationId: string) =>
  useContractMutation((input: SaveContractInput) => api.create(applicationId, input));

export const useUpdateContract = (applicationId: string) =>
  useContractMutation(
    ({ id, input }: { id: string; input: SaveContractInput & { version: number } }) =>
      api.update(applicationId, id, input),
  );

export const useCancelContract = (applicationId: string) =>
  useContractMutation(({ id, input }: { id: string; input: CancelDocumentInput }) =>
    api.cancel(applicationId, id, input),
  );

export const useDeleteContract = (applicationId: string) =>
  useContractMutation(({ id, version }: { id: string; version: number }) =>
    api.remove(applicationId, id, version),
  );

type FileVariables = {
  id: string;
  kind: ContractFileKind;
  file: File;
  onProgress?: (percent: number) => void;
};

export const useUploadContractFile = (applicationId: string) =>
  useContractMutation(({ id, kind, file, onProgress }: FileVariables) =>
    api.uploadFile(applicationId, id, kind, file, onProgress),
  );

export const useRemoveContractFile = (applicationId: string) =>
  useContractMutation(({ id, kind }: { id: string; kind: ContractFileKind }) =>
    api.removeFile(applicationId, id, kind),
  );
