import type { LoginInput, UserDto } from '@tu-registry/shared';
import { createContext, useContext } from 'react';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export type AuthContextValue = {
  status: AuthStatus;
  user: UserDto | null;
  /** True when the previous session ended on its own (expired, revoked, deactivated). */
  sessionEnded: boolean;
  login: (input: LoginInput) => Promise<UserDto>;
  logout: () => Promise<void>;
  updateUser: (user: UserDto) => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** For components rendered only behind ProtectedRoute. */
export function useCurrentUser() {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used outside a protected route');
  return user;
}
