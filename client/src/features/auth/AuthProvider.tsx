import type { LoginInput, UserDto } from '@tu-registry/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { authEvents } from '@/shared/api/authEvents';
import { refreshSession } from '@/shared/api/http';
import { tokenStore } from '@/shared/api/tokenStore';
import { clearAllDrafts } from '@/shared/lib/draftStorage';
import { authApi } from './api';
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext';

type State = {
  status: AuthStatus;
  user: UserDto | null;
  sessionEnded: boolean;
  previousUserId: string | null;
  signedOut: boolean;
};

const ANONYMOUS = { status: 'anonymous', user: null, previousUserId: null } as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({
    status: 'loading',
    user: null,
    sessionEnded: false,
    previousUserId: null,
    signedOut: false,
  });
  const signedIn = (user: UserDto): State => ({
    status: 'authenticated',
    user,
    sessionEnded: false,
    previousUserId: null,
    signedOut: false,
  });

  // Restore the session from the httpOnly cookie after a page load.
  useEffect(() => {
    let active = true;
    refreshSession()
      .then(({ user }) => active && setState(signedIn(user)))
      .catch(() => active && setState({ ...ANONYMOUS, sessionEnded: false, signedOut: false }));
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      authEvents.subscribe((event) => {
        if (event === 'session-ended') {
          queryClient.clear();
          setState((s) => ({
            ...ANONYMOUS,
            sessionEnded: true,
            // Only they may come back to the page they were on.
            previousUserId: s.user?.id ?? null,
            signedOut: false,
          }));
        } else {
          setState((s) => (s.user ? { ...s, user: { ...s.user, mustChangePassword: true } } : s));
        }
      }),
    [queryClient],
  );

  const login = useCallback(async (input: LoginInput) => {
    const { user, accessToken } = await authApi.login(input);
    tokenStore.set(accessToken);
    setState(signedIn(user));
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      tokenStore.set(null);
      // Nothing from the previous user may remain: cached data and unsaved form drafts.
      queryClient.clear();
      clearAllDrafts();
      setState({ ...ANONYMOUS, sessionEnded: false, signedOut: true });
    }
  }, [queryClient]);

  const updateUser = useCallback((user: UserDto) => setState((s) => ({ ...s, user })), []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, updateUser }),
    [state, login, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
