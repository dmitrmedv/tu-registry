import type {
  CancelDocumentInput,
  CreateTechnicalConditionsInput,
  TechnicalConditionsDto,
  UpdateTechnicalConditionsInput,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';
import { fetchPdf } from '@/shared/lib/pdf';

const base = (applicationId: string) => `/applications/${applicationId}/technical-conditions`;

export const technicalConditionsApi = {
  list: (applicationId: string) =>
    http.get<TechnicalConditionsDto[]>(base(applicationId)).then((r) => r.data),
  create: (applicationId: string, input: CreateTechnicalConditionsInput) =>
    http.post<TechnicalConditionsDto>(base(applicationId), input).then((r) => r.data),
  update: (applicationId: string, id: string, input: UpdateTechnicalConditionsInput) =>
    http.patch<TechnicalConditionsDto>(`${base(applicationId)}/${id}`, input).then((r) => r.data),
  cancel: (applicationId: string, id: string, input: CancelDocumentInput) =>
    http
      .post<TechnicalConditionsDto>(`${base(applicationId)}/${id}/cancel`, input)
      .then((r) => r.data),
  restore: (applicationId: string, id: string, version: number) =>
    http
      .post<TechnicalConditionsDto>(`${base(applicationId)}/${id}/restore`, { version })
      .then((r) => r.data),
  uploadScan: (applicationId: string, id: string, file: File) => {
    const form = new FormData();
    form.append('scan', file);
    return http
      .put<TechnicalConditionsDto>(`${base(applicationId)}/${id}/scan`, form)
      .then((r) => r.data);
  },
  removeScan: (applicationId: string, id: string) =>
    http.delete<TechnicalConditionsDto>(`${base(applicationId)}/${id}/scan`).then((r) => r.data),
  /** The current scan, or an earlier one by its id. */
  scanFile: (applicationId: string, id: string, fileId?: string) =>
    fetchPdf(`${base(applicationId)}/${id}/scan`, fileId ? { file: fileId } : undefined),
};
