import { zodResolver } from '@hookform/resolvers/zod';
import { createEngineerSchema, type Department, type EngineerDto } from '@tu-registry/shared';
import { type FieldPath, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useDepartments } from '@/features/departments';
import { toApiError } from '@/shared/api/apiError';
import { Button, Dialog, SelectField, Spinner, TextField } from '@/shared/ui';
import styles from './engineers.module.scss';
import { useCreateEngineer, useUpdateEngineer } from './queries';
import { notifyError } from '@/shared/lib/notify';

type FormInput = z.input<typeof createEngineerSchema>;
type FormOutput = z.output<typeof createEngineerSchema>;
type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

const FORM_ID = 'engineer-form';

type Props = {
  /** Editing this one (its name only); a new engineer when absent. */
  engineer?: EngineerDto;
  /** Preselected for a new engineer. */
  department: Department;
  onClose: () => void;
  onSaved: (engineer: EngineerDto) => void;
};

export function EngineerDialog({ engineer, department, onClose, onSaved }: Props) {
  const departments = useDepartments();
  const create = useCreateEngineer();
  const update = useUpdateEngineer();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createEngineerSchema),
    defaultValues: {
      fullName: engineer?.fullName ?? '',
      department: engineer?.department ?? department,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = engineer
        ? await update.mutateAsync({ id: engineer.id, input: { fullName: values.fullName } })
        : await create.mutateAsync(values);
      onSaved(saved);
    } catch (error) {
      const apiError = toApiError(error);
      const fieldErrors = (apiError.details as ServerErrorDetails | undefined)?.fieldErrors ?? {};
      const fields = Object.entries(fieldErrors);
      for (const [field, messages] of fields) {
        if (messages?.[0]) setError(field as FieldPath<FormInput>, { message: messages[0] });
      }
      if (fields.length === 0) notifyError(apiError.message);
    }
  });

  return (
    <Dialog
      busy={isSubmitting}
      open
      title={engineer ? `Редагування: ${engineer.fullName}` : 'Новий інженер'}
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          {engineer ? 'Зберегти' : 'Додати'}
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={styles.formContents}>
        <TextField label="ПІБ" error={errors.fullName?.message} {...register('fullName')} />
        {engineer ? (
          // Each department has its own engineers: the department is never changed.
          <p>Управління: {departments.nameOf(engineer.department)}</p>
        ) : departments.isPending ? (
          // An uncontrolled select would otherwise settle on whichever option comes first.
          <Spinner label="Завантаження управлінь…" />
        ) : (
          <SelectField
            label="Управління"
            hint="Інженер працює лише в цьому управлінні; змінити його згодом не можна"
            options={departments.activeOptions}
            error={errors.department?.message}
            {...register('department')}
          />
        )}
      </form>
    </Dialog>
  );
}
