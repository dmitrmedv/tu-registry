import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ApplicationDto,
  type CreateApplicationData,
  type CreateApplicationInput,
  createApplicationSchema,
  OBJECT_TYPES,
} from '@tu-registry/shared';
import { type FieldPath, useForm } from 'react-hook-form';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { OBJECT_TYPE_LABELS } from '@/shared/lib/labels';
import { Alert, Button, SelectField, Spinner, TextField } from '@/shared/ui';
import styles from './ApplicationForm.module.scss';
import { useCreateApplication, useNextNumber } from './queries';

const OBJECT_TYPE_OPTIONS = [
  { value: '', label: '— оберіть —' },
  ...OBJECT_TYPES.map((type) => ({ value: type, label: OBJECT_TYPE_LABELS[type] })),
];

type FieldErrors = { fieldErrors?: Record<string, string[] | undefined> };

function RegistrationPreview() {
  const { data, isPending, isError } = useNextNumber();
  if (isPending) return <Spinner label="Визначення наступного номера…" />;
  if (isError)
    return <p className={styles.muted}>Дату й номер буде присвоєно під час збереження.</p>;
  return (
    <dl className={styles.preview}>
      <div>
        <dt>Дата реєстрації</dt>
        <dd>{formatCalendarDate(data.regDate)}</dd>
      </div>
      <div>
        <dt>Номер (орієнтовно)</dt>
        <dd>{data.regNumber}</dd>
      </div>
    </dl>
  );
}

export function ApplicationForm({ onCreated }: { onCreated: (app: ApplicationDto) => void }) {
  const createApplication = useCreateApplication();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateApplicationInput, unknown, CreateApplicationData>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: {
      customer: '',
      customerRepresentative: '',
      phone: '',
      email: '',
      objectAddress: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      onCreated(await createApplication.mutateAsync(values));
    } catch (error) {
      const apiError = toApiError(error);
      // Server-side validation mirrors the client; show its field messages where they belong.
      const fieldErrors = (apiError.details as FieldErrors | undefined)?.fieldErrors ?? {};
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages?.[0]) {
          setError(field as FieldPath<CreateApplicationInput>, { message: messages[0] });
        }
      }
      setError('root', { message: apiError.message });
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {errors.root?.message && <Alert variant="error">{errors.root.message}</Alert>}

      <fieldset className={styles.section}>
        <legend>Замовник</legend>
        <div className={styles.grid}>
          <TextField label="Замовник" error={errors.customer?.message} {...register('customer')} />
          <TextField
            label="Представник замовника"
            error={errors.customerRepresentative?.message}
            {...register('customerRepresentative')}
          />
          <TextField
            label="Телефон"
            type="tel"
            autoComplete="off"
            hint="Наприклад: 067 123 45 67"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            label="Email (необовʼязково)"
            type="email"
            autoComplete="off"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend>Обʼєкт</legend>
        <div className={styles.grid}>
          <TextField
            className={styles.wide}
            label="Адреса обʼєкта"
            error={errors.objectAddress?.message}
            {...register('objectAddress')}
          />
          <SelectField
            label="Тип обʼєкта"
            options={OBJECT_TYPE_OPTIONS}
            error={errors.objectType?.message}
            {...register('objectType')}
          />
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend>Реєстрація</legend>
        <RegistrationPreview />
        <p className={styles.muted}>
          Дата й номер присвоюються автоматично під час збереження. Номер може відрізнятися від
          орієнтовного, якщо інший працівник зареєструє заяву раніше.
        </p>
      </fieldset>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          Зареєструвати заяву
        </Button>
      </div>
    </form>
  );
}
