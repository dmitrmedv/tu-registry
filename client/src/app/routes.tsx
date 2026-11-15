import type { RouteObject } from 'react-router';
import { CHANGE_PASSWORD_PATH, ProtectedRoute, RequireRole } from '@/features/auth';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { NewApplicationPage } from '@/pages/NewApplicationPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RegistryPage } from '@/pages/RegistryPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { UsersPage } from '@/pages/UsersPage';
import { AppLayout } from './AppLayout';

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
          { path: CHANGE_PASSWORD_PATH, element: <ChangePasswordPage /> },
          {
            element: <RequireRole role="ADMIN" />,
            children: [{ path: '/users', element: <UsersPage /> }],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
