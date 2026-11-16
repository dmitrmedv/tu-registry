import type {
  CreateEngineerInput,
  EngineerDto,
  EngineerListQuery,
  UpdateEngineerInput,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';

export const engineersApi = {
  /** A user always gets their own department's engineers; an admin any (by `department`). */
  list: (query: EngineerListQuery = {}) =>
    http.get<EngineerDto[]>('/engineers', { params: query }).then((r) => r.data),
  create: (input: CreateEngineerInput) =>
    http.post<EngineerDto>('/engineers', input).then((r) => r.data),
  update: (id: string, input: UpdateEngineerInput) =>
    http.patch<EngineerDto>(`/engineers/${id}`, input).then((r) => r.data),
};
