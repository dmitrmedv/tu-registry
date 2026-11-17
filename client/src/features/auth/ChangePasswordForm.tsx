import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ChangePasswordFormValues,
  changePasswordFormSchema,
  PASSWORD_MIN_LENGTH,
} from '@tu-registry/shared';
import { useForm } from 'react-hook-form';
import { toApiError } from '@/shared/api/apiError';
import { notifySuccess } from '@/shared/lib/notify';
import { Alert, Button, PasswordField } from '@/shared/ui';
import { authApi } from './api';
import { useAuth } from './authContext';
import styles from './AuthForm.module.scss';

const SERVER_FIELD_ERRORS: Record<string, 'currentPassword' | 'newPassword'> = {
  INVALID_CURRENT_PASSWORD: 'currentPassword',
  WEAK_PASSWORD: 'newPassword',
};

export function ChangePasswordForm({ onChanged }: { onChanged: () => void }) {
  const { updateUser } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(changePasswordFormSchema) });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      // The confirmation field is checked in the browser and never sent.
      const user = await authApi.changePassword({ currentPassword, newPassword });
      updateUser(user);
      reset();
      notifySuccess('Пароль змінено');
      onChanged();
    } catch (error) {
      const apiError = toApiError(error);
      const field = SERVER_FIELD_ERRORS[apiError.code];
      setError(field ?? 'root', { message: apiError.message });
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {errors.root?.message && <Alert variant="error">{errors.root.message}</Alert>}
      <PasswordField
        label="Поточний пароль"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <PasswordField
        label="Новий пароль"
        autoComplete="new-password"
        hint={`Щонайменше ${PASSWORD_MIN_LENGTH} символів; не збігається з логіном`}
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <PasswordField
        label="Повторіть новий пароль"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      <Button type="submit" variant="primary" loading={isSubmitting}>
        Змінити пароль
      </Button>
    </form>
  );
}
