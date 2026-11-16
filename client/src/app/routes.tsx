import { type ComponentType, lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router';
import { CHANGE_PASSWORD_PATH, ProtectedRoute, RequireRole } from '@/features/auth';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { NewApplicationPage } from '@/pages/NewApplicationPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RegistryPage } from '@/pages/RegistryPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { FullPageSpinner } from '@/shared/ui';
import { AppLayout } from './AppLayout';

/** Pages opened less often are loaded on demand, keeping the initial bundle small. */
function lazyPage(load: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(load);
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Page />
    </Suspense>
  );
}

const applicationPage = lazyPage(() =>
  import('@/pages/ApplicationPage').then((m) => ({ default: m.ApplicationPage })),
);
const editApplicationPage = lazyPage(() =>
  import('@/pages/EditApplicationPage').then((m) => ({ default: m.EditApplicationPage })),
);
const usersPage = lazyPage(() =>
  import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })),
);
const departmentsPage = lazyPage(() =>
  import('@/pages/DepartmentsPage').then((m) => ({ default: m.DepartmentsPage })),
);
const engineersPage = lazyPage(() =>
  import('@/pages/EngineersPage').then((m) => ({ default: m.EngineersPage })),
);
const calendarPage = lazyPage(() =>
  import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const auditPage = lazyPage(() =>
  import('@/pages/AuditPage').then((m) => ({ default: m.AuditPage })),
);

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <RegistryPage /> },
          { path: '/applications/new', element: <NewApplicationPage /> },
          { path: '/applications/:id', element: applicationPage },
          { path: '/applications/:id/edit', element: editApplicationPage },
          { path: CHANGE_PASSWORD_PATH, element: <ChangePasswordPage /> },
          {
            element: <RequireRole role="ADMIN" />,
            children: [
              { path: '/users', element: usersPage },
              { path: '/audit', element: auditPage },
              { path: '/departments', element: departmentsPage },
              { path: '/engineers', element: engineersPage },
              { path: '/calendar', element: calendarPage },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
