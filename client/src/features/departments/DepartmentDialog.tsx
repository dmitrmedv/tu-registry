import { zodResolver } from '@hookform/resolvers/zod';
import { createDepartmentSchema, type DepartmentDto, formatRegNumber } from '@tu-registry/shared';
import { type FieldPath, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { toApiError } from '@/shared/api/apiError';
import { Alert, Button, Dialog, TextField } from '@/shared/ui';
import { useCreateDepartment, useUpdateDepartment } from './queries';
import styles from './departments.module.scss';

type FormInput = z.input<typeof createDepartmentSchema>;
type FormOutput = z.output<typeof createDepartmentSchema>;
type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

const FORM_ID = 'department-form';

type Props = {
  /** Editing this one; a new department when absent. */
  department?: DepartmentDto;
  /** Offered for a new department: the next free code. */
  suggestedCode: number;
  onClose: () => void;
  onSaved: (department: DepartmentDto) => void;
};

export function DepartmentDialog({ department, suggestedCode, onClose, onSaved }: Props) {
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createDepartmentSchema),
    defaultValues: {
      name: department?.name ?? '',
      code: String(department?.code ?? suggestedCode),
    },
  });
  const code = Number(watch('code'));

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = department
        ? await update.mutateAsync({ id: department.id, input: values })
        : await create.mutateAsync(values);
      onSaved(saved);
    } catch (error) {
      const apiError = toApiError(error);
      const fieldErrors = (apiError.details as ServerErrorDetails | undefined)?.fieldErrors ?? {};
      const fields = Object.entries(fieldErrors);
      for (const [field, messages] of fields) {
        if (messages?.[0]) setError(field as FieldPath<FormInput>, { message: messages[0] });
      }
      if (fields.length === 0) setError('root', { message: apiError.message });
    }
  });

  return (
    <Dialog
      open
      title={department ? `Редагування: ${department.name}` : 'Нове управління'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Скасувати
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
            {department ? 'Зберегти' : 'Додати'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={styles.formContents}>
        {errors.root?.message && <Alert variant="error">{errors.root.message}</Alert>}
        <TextField
          label="Назва"
          hint="Без слова «управління»: «Одеське», «Одеське міжрайонне»"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Код"
          inputMode="numeric"
          autoComplete="off"
          hint={
            Number.isInteger(code) && code > 0
              ? `Іде в номер заяви, наприклад ${formatRegNumber(2026, 1, code)}`
              : 'Ціле число, унікальне серед управлінь'
          }
          error={errors.code?.message}
          {...register('code')}
        />
        {department && (
          <Alert variant="info">
            Після зміни коду номери всіх заяв цього управління показуватимуться з новим кодом.
          </Alert>
        )}
      </form>
    </Dialog>
  );
}
