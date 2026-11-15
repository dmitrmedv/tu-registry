import type { RouteObject } from 'react-router';
import { CHANGE_PASSWORD_PATH, ProtectedRoute, RequireRole } from '@/features/auth';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
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
          { index: true, element: <HomePage /> },
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
