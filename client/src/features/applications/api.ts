import type {
  AnnulApplicationInput,
  ApplicationChangeDto,
  ApplicationDto,
  CreateApplicationData,
  Department,
  ManualApplicationInput,
  ManualNumberCheckDto,
  NextNumberDto,
  UpdateApplicationInput,
} from '@tu-registry/shared';
import { isAxiosError } from 'axios';
import { http } from '@/shared/api/http';

export type ManualNumberCheckParams = {
  regDate: string;
  regSeq: number;
  /** Used by the server for admins only; users always check their own department. */
  department: Department;
  excludeId?: string;
};

export const applicationsApi = {
  create: (data: CreateApplicationData) =>
    http.post<ApplicationDto>('/applications', data).then((r) => r.data),
  createManual: (data: ManualApplicationInput) =>
    http.post<ApplicationDto>('/applications/manual', data).then((r) => r.data),
  checkManualNumber: (params: ManualNumberCheckParams) =>
    http.get<ManualNumberCheckDto>('/applications/manual/check', { params }).then((r) => r.data),
  /** `department`: admins only; the server uses a user's own department regardless. */
  nextNumber: (department: Department) =>
    http
      .get<NextNumberDto>('/applications/next-number', { params: { department } })
      .then((r) => r.data),
  get: (id: string) => http.get<ApplicationDto>(`/applications/${id}`).then((r) => r.data),
  history: (id: string) =>
    http.get<ApplicationChangeDto[]>(`/applications/${id}/history`).then((r) => r.data),
  update: (id: string, data: UpdateApplicationInput) =>
    http.patch<ApplicationDto>(`/applications/${id}`, data).then((r) => r.data),
  annul: (id: string, data: AnnulApplicationInput) =>
    http.post<ApplicationDto>(`/applications/${id}/annul`, data).then((r) => r.data),
  restore: (id: string, version: number) =>
    http.post<ApplicationDto>(`/applications/${id}/restore`, { version }).then((r) => r.data),
  remove: async (id: string, version: number) => {
    await http.delete(`/applications/${id}`, { params: { version } });
  },
  /** `onProgress` gets 0–100 while the file is being sent. */
  uploadScan: (id: string, file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append('scan', file);
    return http
      .put<ApplicationDto>(`/applications/${id}/scan`, form, {
        onUploadProgress: (event) =>
          event.total && onProgress?.(Math.round((event.loaded / event.total) * 100)),
      })
      .then((r) => r.data);
  },
  removeScan: (id: string) =>
    http.delete<ApplicationDto>(`/applications/${id}/scan`).then((r) => r.data),
  /** Fetched with the access token (it lives in memory, so a plain link cannot carry it). */
  scanFile: async (id: string) => {
    try {
      return (await http.get<Blob>(`/applications/${id}/scan`, { responseType: 'blob' })).data;
    } catch (error) {
      // With responseType 'blob' the JSON error body arrives as a Blob too: read it back so
      // toApiError() can show the server's message.
      if (isAxiosError(error) && error.response?.data instanceof Blob) {
        try {
          error.response.data = JSON.parse(await error.response.data.text());
        } catch {
          error.response.data = undefined;
        }
      }
      throw error;
    }
  },
};
