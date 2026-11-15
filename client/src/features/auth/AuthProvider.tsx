import type { LoginInput, UserDto } from '@tu-registry/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { authEvents } from '@/shared/api/authEvents';
import { refreshSession } from '@/shared/api/http';
import { tokenStore } from '@/shared/api/tokenStore';
import { authApi } from './api';
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext';

type State = { status: AuthStatus; user: UserDto | null; sessionEnded: boolean };

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({ status: 'loading', user: null, sessionEnded: false });

  // Restore the session from the httpOnly cookie after a page load.
  useEffect(() => {
    let active = true;
    refreshSession()
      .then(
        ({ user }) => active && setState({ status: 'authenticated', user, sessionEnded: false }),
      )
      .catch(() => active && setState({ status: 'anonymous', user: null, sessionEnded: false }));
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      authEvents.subscribe((event) => {
        if (event === 'session-ended') {
          queryClient.clear();
          setState({ status: 'anonymous', user: null, sessionEnded: true });
        } else {
          setState((s) => (s.user ? { ...s, user: { ...s.user, mustChangePassword: true } } : s));
        }
      }),
    [queryClient],
  );

  const login = useCallback(async (input: LoginInput) => {
    const { user, accessToken } = await authApi.login(input);
    tokenStore.set(accessToken);
    setState({ status: 'authenticated', user, sessionEnded: false });
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      tokenStore.set(null);
      // Nothing from the previous user may remain in the cache.
      queryClient.clear();
      setState({ status: 'anonymous', user: null, sessionEnded: false });
    }
  }, [queryClient]);

  const updateUser = useCallback((user: UserDto) => setState((s) => ({ ...s, user })), []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, updateUser }),
    [state, login, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
