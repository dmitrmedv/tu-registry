import type {
  AnnulApplicationInput,
  ApplicationChangeDto,
  ApplicationDto,
  CreateApplicationData,
  ManualApplicationInput,
  ManualNumberCheckDto,
  NextNumberDto,
  UpdateApplicationInput,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';

export type ManualNumberCheckParams = { regDate: string; regSeq: number; excludeId?: string };

export const applicationsApi = {
  create: (data: CreateApplicationData) =>
    http.post<ApplicationDto>('/applications', data).then((r) => r.data),
  createManual: (data: ManualApplicationInput) =>
    http.post<ApplicationDto>('/applications/manual', data).then((r) => r.data),
  checkManualNumber: (params: ManualNumberCheckParams) =>
    http.get<ManualNumberCheckDto>('/applications/manual/check', { params }).then((r) => r.data),
  nextNumber: () => http.get<NextNumberDto>('/applications/next-number').then((r) => r.data),
  get: (id: string) => http.get<ApplicationDto>(`/applications/${id}`).then((r) => r.data),
  history: (id: string) =>
    http.get<ApplicationChangeDto[]>(`/applications/${id}/history`).then((r) => r.data),
  update: (id: string, data: UpdateApplicationInput) =>
    http.patch<ApplicationDto>(`/applications/${id}`, data).then((r) => r.data),
  annul: (id: string, data: AnnulApplicationInput) =>
    http.post<ApplicationDto>(`/applications/${id}/annul`, data).then((r) => r.data),
  restore: (id: string, version: number) =>
    http.post<ApplicationDto>(`/applications/${id}/restore`, { version }).then((r) => r.data),
};
