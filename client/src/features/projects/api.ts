import type {
  CancelDocumentInput,
  CreateProjectInput,
  InvoiceTermDto,
  ProjectDto,
  UpdateProjectInput,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';
import { fetchPdf } from '@/shared/lib/pdf';

const base = (applicationId: string) => `/applications/${applicationId}/projects`;

const progressOf =
  (onProgress?: (percent: number) => void) => (event: { loaded: number; total?: number }) => {
    if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
  };

export const projectsApi = {
  list: (applicationId: string) => http.get<ProjectDto[]>(base(applicationId)).then((r) => r.data),
  /** Working days from the approval to `date`, both counted, by the server's calendar. */
  invoiceTerm: (applicationId: string, id: string, date: string) =>
    http
      .get<InvoiceTermDto>(`${base(applicationId)}/${id}/invoice-term`, { params: { date } })
      .then((r) => r.data),
  create: (applicationId: string, input: CreateProjectInput) =>
    http.post<ProjectDto>(base(applicationId), input).then((r) => r.data),
  update: (applicationId: string, id: string, input: UpdateProjectInput) =>
    http.patch<ProjectDto>(`${base(applicationId)}/${id}`, input).then((r) => r.data),
  cancel: (applicationId: string, id: string, input: CancelDocumentInput) =>
    http.post<ProjectDto>(`${base(applicationId)}/${id}/cancel`, input).then((r) => r.data),
  restore: (applicationId: string, id: string, version: number) =>
    http.post<ProjectDto>(`${base(applicationId)}/${id}/restore`, { version }).then((r) => r.data),
  /** For good, with every file; an admin only. */
  remove: async (applicationId: string, id: string, version: number) => {
    await http.delete(`${base(applicationId)}/${id}`, { params: { version } });
  },
  /** The project's scan; replaced ones are kept. */
  uploadScan: (
    applicationId: string,
    id: string,
    file: File,
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData();
    form.append('scan', file);
    return http
      .put<ProjectDto>(`${base(applicationId)}/${id}/scan`, form, {
        onUploadProgress: progressOf(onProgress),
      })
      .then((r) => r.data);
  },
  removeScan: (applicationId: string, id: string) =>
    http.delete<ProjectDto>(`${base(applicationId)}/${id}/scan`).then((r) => r.data),
  /** The current scan, or an earlier one by its id. */
  scanFile: (applicationId: string, id: string, fileId?: string) =>
    fetchPdf(`${base(applicationId)}/${id}/scan`, fileId ? { file: fileId } : undefined),
};
