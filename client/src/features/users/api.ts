import type {
  CreateUserInput,
  UpdateUserInput,
  UserDto,
  UserWithTemporaryPassword,
} from '@tu-registry/shared';
import { http } from '@/shared/api/http';

export const usersApi = {
  list: () => http.get<UserDto[]>('/users').then((r) => r.data),
  create: (input: CreateUserInput) =>
    http.post<UserWithTemporaryPassword>('/users', input).then((r) => r.data),
  update: (id: string, input: UpdateUserInput) =>
    http.patch<UserDto>(`/users/${id}`, input).then((r) => r.data),
  resetPassword: (id: string) =>
    http.post<UserWithTemporaryPassword>(`/users/${id}/reset-password`).then((r) => r.data),
};
