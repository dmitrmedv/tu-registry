import type {
  CreateDepartmentInput,
  Department,
  DepartmentAdminDto,
  DepartmentDto,
  UpdateDepartmentInput,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';

export const departmentsApi = {
  /** Admins also get usersCount and applicationsCount. */
  list: () =>
    http.get<(DepartmentDto & Partial<DepartmentAdminDto>)[]>('/departments').then((r) => r.data),
  create: (input: CreateDepartmentInput) =>
    http.post<DepartmentDto>('/departments', input).then((r) => r.data),
  update: (id: Department, input: UpdateDepartmentInput) =>
    http.patch<DepartmentDto>(`/departments/${id}`, input).then((r) => r.data),
  archive: (id: Department) =>
    http.post<DepartmentDto>(`/departments/${id}/archive`).then((r) => r.data),
  restore: (id: Department) =>
    http.post<DepartmentDto>(`/departments/${id}/restore`).then((r) => r.data),
  remove: async (id: Department) => {
    await http.delete(`/departments/${id}`);
  },
};
