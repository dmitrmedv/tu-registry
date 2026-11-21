import type {
  CancelDocumentInput,
  CreateInvoiceInput,
  InvoiceDto,
  InvoiceFileKind,
  UpdateInvoiceInput,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';
import { fetchPdf } from '@/shared/lib/pdf';

const base = (applicationId: string) => `/applications/${applicationId}/invoices`;

export const invoicesApi = {
  list: (applicationId: string) => http.get<InvoiceDto[]>(base(applicationId)).then((r) => r.data),
  create: (applicationId: string, input: CreateInvoiceInput) =>
    http.post<InvoiceDto>(base(applicationId), input).then((r) => r.data),
  update: (applicationId: string, id: string, input: UpdateInvoiceInput) =>
    http.patch<InvoiceDto>(`${base(applicationId)}/${id}`, input).then((r) => r.data),
  cancel: (applicationId: string, id: string, input: CancelDocumentInput) =>
    http.post<InvoiceDto>(`${base(applicationId)}/${id}/cancel`, input).then((r) => r.data),
  restore: (applicationId: string, id: string, version: number) =>
    http.post<InvoiceDto>(`${base(applicationId)}/${id}/restore`, { version }).then((r) => r.data),
  /** For good, with its files; an admin only. */
  remove: async (applicationId: string, id: string, version: number) => {
    await http.delete(`${base(applicationId)}/${id}`, { params: { version } });
  },
  /** Both files are PDF and come in the "scan" field. */
  uploadFile: (
    applicationId: string,
    id: string,
    kind: InvoiceFileKind,
    file: File,
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData();
    form.append('scan', file);
    return http
      .put<InvoiceDto>(`${base(applicationId)}/${id}/files/${kind}`, form, {
        onUploadProgress: (event) => {
          if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
        },
      })
      .then((r) => r.data);
  },
  removeFile: (applicationId: string, id: string, kind: InvoiceFileKind) =>
    http.delete<InvoiceDto>(`${base(applicationId)}/${id}/files/${kind}`).then((r) => r.data),
  file: (applicationId: string, id: string, kind: InvoiceFileKind) =>
    fetchPdf(`${base(applicationId)}/${id}/files/${kind}`),
};
