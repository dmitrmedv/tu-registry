import type { SaveTuPaymentInput, TuPaymentScanKind } from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tuPaymentApi as api } from './api';

function usePaymentMutation<TVariables, TResult>(fn: (v: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // The technical conditions and the timeline live under the application's key.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}

export const useSaveTuPayment = (applicationId: string, tuId: string) =>
  usePaymentMutation((input: SaveTuPaymentInput) => api.save(applicationId, tuId, input));

export const useDeleteTuPayment = (applicationId: string, tuId: string) =>
  usePaymentMutation((version: number) => api.remove(applicationId, tuId, version));

export const useUploadTuPaymentScan = (applicationId: string, tuId: string) =>
  usePaymentMutation(
    ({
      kind,
      file,
      onProgress,
    }: {
      kind: TuPaymentScanKind;
      file: File;
      onProgress?: (percent: number) => void;
    }) => api.uploadScan(applicationId, tuId, kind, file, onProgress),
  );

export const useRemoveTuPaymentScan = (applicationId: string, tuId: string) =>
  usePaymentMutation((kind: TuPaymentScanKind) => api.removeScan(applicationId, tuId, kind));

/** The contract number offered in the dialog; asked only while the payment has none. */
export const useNextContractNumber = (applicationId: string, tuId: string, enabled: boolean) =>
  useQuery({
    queryKey: ['applications', applicationId, 'technical-conditions', tuId, 'contract-number'],
    queryFn: () => api.nextContractNumber(applicationId, tuId),
    enabled,
    // Asked afresh each time the dialog opens: another payment may have taken it.
    gcTime: 0,
  });
