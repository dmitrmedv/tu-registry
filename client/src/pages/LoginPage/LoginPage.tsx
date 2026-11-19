import { Navigate, useLocation } from 'react-router';
import { LoginForm, useAuth } from '@/features/auth';
import { FullPageSpinner } from '@/shared/ui';
import styles from './LoginPage.module.scss';

type ReturnState = { from?: unknown; forUser?: unknown } | null;

/**
 * Only same-app paths are accepted as a return target (no open redirects), and only for the
 * user who was on that page when their session ended; anyone else starts at the registry.
 */
function returnPath(state: unknown, userId: string) {
  const { from, forUser } = (state as ReturnState) ?? {};
  if (typeof forUser === 'string' && forUser !== userId) return '/';
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/';
}

export function LoginPage() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated' && user) {
    return <Navigate to={returnPath(location.state, user.id)} replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Вхід до системи</h1>
        <p className={styles.subtitle}>Реєстр заяв на технічні умови</p>
        <LoginForm />
      </div>
    </main>
  );
}
