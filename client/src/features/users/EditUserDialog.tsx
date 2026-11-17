import { zodResolver } from '@hookform/resolvers/zod';
import {
  editUserFormSchema,
  type EditUserFormValues,
  type UpdateUserInput,
  type UserDto,
} from '@tu-registry/shared';
import { useForm } from 'react-hook-form';
import { Alert, Button, CheckboxField, Dialog, SelectField, TextField } from '@/shared/ui';
import { useDepartments } from '@/features/departments';
import { DEPARTMENT_HINT, MANAGE_REGISTRATION_HINT, ROLE_OPTIONS } from './roleOptions';
import styles from './users.module.scss';

const FORM_ID = 'edit-user-form';

type Props = {
  user: UserDto;
  isSelf: boolean;
  onClose: () => void;
  /** Receives only the changed fields; the parent decides whether to confirm first. */
  onSubmit: (changes: UpdateUserInput) => Promise<void>;
  error?: string;
};

export function EditUserDialog({ user, isSelf, onClose, onSubmit, error }: Props) {
  const departments = useDepartments();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
      fullName: user.fullName,
      department: user.department,
      role: user.role,
      canManageRegistration: user.canManageRegistration,
      isActive: user.isActive,
    },
  });

  const submit = handleSubmit(async (values) => {
    const changes = Object.fromEntries(
      Object.entries(values).filter(([key, value]) => user[key as keyof UserDto] !== value),
    ) as UpdateUserInput;
    if (Object.keys(changes).length === 0) return onClose();
    await onSubmit(changes);
  });

  const selfHint = isSelf ? 'Власну роль і статус змінити не можна' : undefined;

  return (
    <Dialog
      busy={isSubmitting}
      open
      title={`Редагування: ${user.login}`}
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          Зберегти
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className={styles.formContents}>
        {error && <Alert variant="error">{error}</Alert>}
        <TextField label="ПІБ" error={errors.fullName?.message} {...register('fullName')} />
        {/* Once the departments are loaded: the select must have the current value's option when it mounts. */}
        {!departments.isPending && (
          <SelectField
            label="Управління"
            options={departments.optionsWith(user.department)}
            hint={`${DEPARTMENT_HINT}. Уже зареєстровані ним заяви лишаються у своєму управлінні.`}
            error={errors.department?.message}
            {...register('department')}
          />
        )}
        <SelectField
          label="Роль"
          options={ROLE_OPTIONS}
          disabled={isSelf}
          hint={selfHint}
          {...register('role')}
        />
        <CheckboxField
          label="Уповноважений користувач"
          hint={MANAGE_REGISTRATION_HINT}
          {...register('canManageRegistration')}
        />
        <CheckboxField
          label="Обліковий запис активний"
          hint={selfHint ?? 'Деактивований користувач не може увійти; його сесії завершуються'}
          disabled={isSelf}
          {...register('isActive')}
        />
      </form>
    </Dialog>
  );
}
