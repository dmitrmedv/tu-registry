import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema, type UserWithTemporaryPassword } from '@tu-registry/shared';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { toApiError } from '@/shared/api/apiError';
import { Alert, Button, CheckboxField, Dialog, SelectField, TextField } from '@/shared/ui';
import { useCreateUser } from './queries';
import { useDepartments } from '@/features/departments';
import { DEPARTMENT_HINT, MANAGE_REGISTRATION_HINT, ROLE_OPTIONS } from './roleOptions';
import styles from './users.module.scss';

type FormInput = z.input<typeof createUserSchema>;
type FormOutput = z.output<typeof createUserSchema>;

const FORM_ID = 'create-user-form';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (result: UserWithTemporaryPassword) => void;
};

export function CreateUserDialog({ open, onClose, onCreated }: Props) {
  const createUser = useCreateUser();
  const departments = useDepartments();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      login: '',
      fullName: '',
      department: '' as FormInput['department'],
      role: 'USER',
      canManageRegistration: false,
    },
  });

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await createUser.mutateAsync(values);
      reset();
      onCreated(result);
    } catch (error) {
      const apiError = toApiError(error);
      setError(apiError.status === 409 ? 'login' : 'root', { message: apiError.message });
    }
  });

  return (
    <Dialog
      open={open}
      title="Новий користувач"
      onClose={close}
      footer={
        <>
          <Button onClick={close} disabled={isSubmitting}>
            Скасувати
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
            Створити
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={styles.formContents}>
        {errors.root?.message && <Alert variant="error">{errors.root.message}</Alert>}
        <TextField
          label="Логін"
          autoCapitalize="none"
          spellCheck={false}
          hint="Латинські літери, цифри, «.», «_», «-»"
          error={errors.login?.message}
          {...register('login')}
        />
        <TextField label="ПІБ" error={errors.fullName?.message} {...register('fullName')} />
        {/* Once the departments are loaded: the select must have the current value's option when it mounts. */}
        {!departments.isPending && (
          <SelectField
            label="Управління"
            options={[{ value: '', label: '— оберіть —' }, ...departments.activeOptions]}
            hint={DEPARTMENT_HINT}
            error={errors.department?.message}
            {...register('department')}
          />
        )}
        <SelectField label="Роль" options={ROLE_OPTIONS} {...register('role')} />
        <CheckboxField
          label="Уповноважений користувач"
          hint={MANAGE_REGISTRATION_HINT}
          {...register('canManageRegistration')}
        />
        <Alert variant="info">
          Тимчасовий пароль буде згенеровано автоматично й показано один раз після створення.
        </Alert>
      </form>
    </Dialog>
  );
}
