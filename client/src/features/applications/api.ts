import type {
  ApplicationDto,
  CreateApplicationData,
  ManualApplicationInput,
  ManualNumberCheckDto,
  NextNumberDto,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';

export const applicationsApi = {
  create: (data: CreateApplicationData) =>
    http.post<ApplicationDto>('/applications', data).then((r) => r.data),
  createManual: (data: ManualApplicationInput) =>
    http.post<ApplicationDto>('/applications/manual', data).then((r) => r.data),
  checkManualNumber: (params: { regDate: string; regSeq: number }) =>
    http.get<ManualNumberCheckDto>('/applications/manual/check', { params }).then((r) => r.data),
  nextNumber: () => http.get<NextNumberDto>('/applications/next-number').then((r) => r.data),
};
