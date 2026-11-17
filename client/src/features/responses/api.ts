import type {
  CancelDocumentInput,
  CreateResponseInput,
  ResponseDto,
  UpdateResponseInput,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';
import { fetchPdf } from '@/shared/lib/pdf';

const base = (applicationId: string) => `/applications/${applicationId}/responses`;

export const responsesApi = {
  list: (applicationId: string) => http.get<ResponseDto[]>(base(applicationId)).then((r) => r.data),
  create: (applicationId: string, input: CreateResponseInput) =>
    http.post<ResponseDto>(base(applicationId), input).then((r) => r.data),
  update: (applicationId: string, id: string, input: UpdateResponseInput) =>
    http.patch<ResponseDto>(`${base(applicationId)}/${id}`, input).then((r) => r.data),
  cancel: (applicationId: string, id: string, input: CancelDocumentInput) =>
    http.post<ResponseDto>(`${base(applicationId)}/${id}/cancel`, input).then((r) => r.data),
  restore: (applicationId: string, id: string, version: number) =>
    http.post<ResponseDto>(`${base(applicationId)}/${id}/restore`, { version }).then((r) => r.data),
  remove: async (applicationId: string, id: string, version: number) => {
    await http.delete(`${base(applicationId)}/${id}`, { params: { version } });
  },
  uploadScan: (applicationId: string, id: string, file: File) => {
    const form = new FormData();
    form.append('scan', file);
    return http.put<ResponseDto>(`${base(applicationId)}/${id}/scan`, form).then((r) => r.data);
  },
  removeScan: (applicationId: string, id: string) =>
    http.delete<ResponseDto>(`${base(applicationId)}/${id}/scan`).then((r) => r.data),
  /** The current scan, or an earlier one by its id. */
  scanFile: (applicationId: string, id: string, fileId?: string) =>
    fetchPdf(`${base(applicationId)}/${id}/scan`, fileId ? { file: fileId } : undefined),
};
