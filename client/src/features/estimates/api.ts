import type {
  CreateEstimateInput,
  EstimateDto,
  EstimateFileKind,
  UpdateEstimateInput,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';
import { fetchPdf } from '@/shared/lib/pdf';

const base = (applicationId: string) => `/applications/${applicationId}/estimates`;

export const estimatesApi = {
  list: (applicationId: string) => http.get<EstimateDto[]>(base(applicationId)).then((r) => r.data),
  /** The first estimate of the valid project, or its recalculation. */
  create: (applicationId: string, input: CreateEstimateInput) =>
    http.post<EstimateDto>(base(applicationId), input).then((r) => r.data),
  update: (applicationId: string, id: string, input: UpdateEstimateInput) =>
    http.patch<EstimateDto>(`${base(applicationId)}/${id}`, input).then((r) => r.data),
  /** For good, with its files; an admin only. */
  remove: async (applicationId: string, id: string, version: number) => {
    await http.delete(`${base(applicationId)}/${id}`, { params: { version } });
  },
  /** The scan goes in the "scan" field, the IMD check file in "imd". */
  uploadFile: (
    applicationId: string,
    id: string,
    kind: EstimateFileKind,
    file: File,
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData();
    form.append(kind, file);
    return http
      .put<EstimateDto>(`${base(applicationId)}/${id}/files/${kind}`, form, {
        onUploadProgress: (event) => {
          if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
        },
      })
      .then((r) => r.data);
  },
  removeFile: (applicationId: string, id: string, kind: EstimateFileKind) =>
    http.delete<EstimateDto>(`${base(applicationId)}/${id}/files/${kind}`).then((r) => r.data),
  file: (applicationId: string, id: string, kind: EstimateFileKind) =>
    fetchPdf(`${base(applicationId)}/${id}/files/${kind}`),
};
