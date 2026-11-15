import type { ApplicationDto, CreateApplicationData, NextNumberDto } from '@tu-registry/shared';
import { http } from '@/shared/api/http';

export const applicationsApi = {
  create: (data: CreateApplicationData) =>
    http.post<ApplicationDto>('/applications', data).then((r) => r.data),
  nextNumber: () => http.get<NextNumberDto>('/applications/next-number').then((r) => r.data),
};
