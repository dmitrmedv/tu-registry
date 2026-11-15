import { Navigate, useLocation } from 'react-router';
import { LoginForm, useAuth } from '@/features/auth';
import { Alert, FullPageSpinner } from '@/shared/ui';
import styles from './LoginPage.module.scss';

/** Only same-app paths are accepted as a return target (no open redirects). */
function returnPath(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/';
}

export function LoginPage() {
  const { status, sessionEnded } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to={returnPath(location.state)} replace />;

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Вхід до системи</h1>
        <p className={styles.subtitle}>Реєстр заяв на технічні умови</p>
        {sessionEnded && <Alert variant="info">Сесія завершилась. Увійдіть знову.</Alert>}
        <LoginForm />
      </div>
    </main>
  );
}
