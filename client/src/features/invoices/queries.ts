import type {
  CancelDocumentInput,
  CreateInvoiceInput,
  InvoiceFileKind,
  UpdateInvoiceInput,
} from '@tu-registry/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoicesApi as api } from './api';

/** Under the application's key: whatever refreshes the application refreshes these too. */
export const invoicesKeys = {
  list: (applicationId: string) => ['applications', applicationId, 'invoices'] as const,
};

export function useInvoices(applicationId: string) {
  return useQuery({
    queryKey: invoicesKeys.list(applicationId),
    queryFn: () => api.list(applicationId),
  });
}

function useInvoiceMutation<TVariables, TResult>(fn: (v: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // The application's timeline and history follow its documents.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}

export const useCreateInvoice = (applicationId: string) =>
  useInvoiceMutation((input: CreateInvoiceInput) => api.create(applicationId, input));

export const useUpdateInvoice = (applicationId: string) =>
  useInvoiceMutation(({ id, input }: { id: string; input: UpdateInvoiceInput }) =>
    api.update(applicationId, id, input),
  );

export const useCancelInvoice = (applicationId: string) =>
  useInvoiceMutation(({ id, input }: { id: string; input: CancelDocumentInput }) =>
    api.cancel(applicationId, id, input),
  );

export const useRestoreInvoice = (applicationId: string) =>
  useInvoiceMutation(({ id, version }: { id: string; version: number }) =>
    api.restore(applicationId, id, version),
  );

export const useDeleteInvoice = (applicationId: string) =>
  useInvoiceMutation(({ id, version }: { id: string; version: number }) =>
    api.remove(applicationId, id, version),
  );

export const useUploadInvoiceFile = (applicationId: string) =>
  useInvoiceMutation(
    ({
      id,
      kind,
      file,
      onProgress,
    }: {
      id: string;
      kind: InvoiceFileKind;
      file: File;
      onProgress?: (p: number) => void;
    }) => api.uploadFile(applicationId, id, kind, file, onProgress),
  );

export const useRemoveInvoiceFile = (applicationId: string) =>
  useInvoiceMutation(({ id, kind }: { id: string; kind: InvoiceFileKind }) =>
    api.removeFile(applicationId, id, kind),
  );
