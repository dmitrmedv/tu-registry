import type { Role } from '@tu-registry/shared';
import { Navigate, Outlet, useLocation } from 'react-router';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { FullPageSpinner } from '@/shared/ui';
import { useAuth } from './authContext';

export const CHANGE_PASSWORD_PATH = '/change-password';

/** Gate for every private route: session, then the forced password change. */
export function ProtectedRoute() {
  const { status, user, signedOut, previousUserId } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;
  if (!user) {
    // After "Вийти" the page is not remembered: whoever signs in next starts at the registry.
    if (signedOut) return <Navigate to="/login" replace />;
    const from = location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from, forUser: previousUserId }} />;
  }
  if (user.mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  return <Outlet />;
}

/** Hides a section from other roles. Convenience only: the server enforces access. */
export function RequireRole({ role }: { role: Role }) {
  const { user } = useAuth();
  return user?.role === role ? <Outlet /> : <ForbiddenPage />;
}
