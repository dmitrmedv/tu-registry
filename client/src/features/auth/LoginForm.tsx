import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@tu-registry/shared';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { toApiError } from '@/shared/api/apiError';
import { Button, PasswordField, TextField } from '@/shared/ui';
import { useAuth } from './authContext';
import styles from './AuthForm.module.scss';
import { notifyError } from '@/shared/lib/notify';

type FormInput = z.input<typeof loginSchema>;
type FormOutput = z.output<typeof loginSchema>;

/** On success the auth state changes and LoginPage redirects; no callback needed. */
export function LoginForm() {
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
    } catch (error) {
      notifyError(toApiError(error).message);
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <TextField
        label="Логін"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        error={errors.login?.message}
        {...register('login')}
      />
      <PasswordField
        label="Пароль"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" variant="primary" loading={isSubmitting}>
        Увійти
      </Button>
    </form>
  );
}
