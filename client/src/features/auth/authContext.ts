import type { LoginInput, UserDto } from '@tu-registry/shared';
import { createContext, useContext } from 'react';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export type AuthContextValue = {
  status: AuthStatus;
  user: UserDto | null;
  /** True when the previous session ended on its own (expired, revoked, deactivated). */
  sessionEnded: boolean;
  /**
   * Who may be returned to the page they were on after signing in again: the user whose
   * session ended on its own. Null after a page load (anyone may follow a link) and after an
   * explicit logout, which returns nobody anywhere (see `signedOut`).
   */
  previousUserId: string | null;
  /** The user pressed "Вийти": the next sign-in starts at the registry. */
  signedOut: boolean;
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
