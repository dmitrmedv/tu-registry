import { useNavigate } from 'react-router';
import { ChangePasswordForm, useCurrentUser } from '@/features/auth';
import { Alert } from '@/shared/ui';
import styles from '../page.module.scss';

export function ChangePasswordPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const forced = user.mustChangePassword;

  return (
    <section className={styles.narrow}>
      <h1>Зміна пароля</h1>
      {forced && (
        <Alert variant="warning">
          Ви увійшли з тимчасовим паролем. Задайте власний пароль, щоб продовжити роботу.
        </Alert>
      )}
      <ChangePasswordForm onChanged={() => forced && navigate('/', { replace: true })} />
    </section>
  );
}
