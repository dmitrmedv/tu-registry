import type { AuthResponse, ChangePasswordInput, LoginInput, UserDto } from '@tu-registry/shared';
import { http } from '@/shared/api/http';

export const authApi = {
  login: (input: LoginInput) => http.post<AuthResponse>('/auth/login', input).then((r) => r.data),
  logout: () => http.post('/auth/logout'),
  changePassword: (input: ChangePasswordInput) =>
    http.post<UserDto>('/auth/change-password', input).then((r) => r.data),
};
