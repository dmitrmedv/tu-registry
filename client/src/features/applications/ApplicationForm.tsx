import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ApplicationDto,
  type CreateApplicationData,
  type CreateApplicationInput,
  createApplicationSchema,
  hasRegistrationRights,
  kyivCalendarDate,
  type ManualApplicationData,
  manualApplicationSchema,
  OBJECT_TYPES,
} from '@tu-registry/shared';
import { useMemo } from 'react';
import { type FieldErrors, type FieldPath, type Resolver, useForm } from 'react-hook-form';
import { useCurrentUser } from '@/features/auth';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { OBJECT_TYPE_LABELS } from '@/shared/lib/labels';
import { Alert, Button, CheckboxField, SelectField, Spinner, TextField } from '@/shared/ui';
import styles from './ApplicationForm.module.scss';
import { ManualNumberStatus } from './ManualNumberStatus';
import { useCreateApplication, useCreateManualApplication, useNextNumber } from './queries';

const OBJECT_TYPE_OPTIONS = [
  { value: '', label: '— оберіть —' },
  ...OBJECT_TYPES.map((type) => ({ value: type, label: OBJECT_TYPE_LABELS[type] })),
];

type FormValues = CreateApplicationInput & { manual: boolean; regDate: string; regSeq: string };
type Submitted =
  (CreateApplicationData & { manual: false }) | (ManualApplicationData & { manual: true });

/** Pre-fills the next form when several old applications are entered in a row. */
export type ManualDefaults = { regDate: string };

type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

/** One form, two strict schemas: the switch decides which one validates the values. */
function useApplicationResolver(today: string): Resolver<FormValues, unknown, Submitted> {
  return useMemo(() => {
    const autoResolver = zodResolver(createApplicationSchema);
    const manualResolver = zodResolver(manualApplicationSchema(today));
    return async (values, context, options) => {
      const { manual, regDate, regSeq, ...fields } = values;
      const result = manual
        ? await manualResolver({ ...fields, regDate, regSeq }, context, options as never)
        : await autoResolver(fields, context, options as never);
      if (Object.keys(result.errors).length > 0) {
        return { values: {}, errors: result.errors as FieldErrors<FormValues> };
      }
      return { values: { ...(result.values as object), manual } as Submitted, errors: {} };
    };
  }, [today]);
}

function RegistrationPreview({ next }: { next: ReturnType<typeof useNextNumber> }) {
  if (next.isPending) return <Spinner label="Визначення наступного номера…" />;
  if (next.isError) {
    return <p className={styles.muted}>Дату й номер буде присвоєно під час збереження.</p>;
  }
  return (
    <dl className={styles.preview}>
      <div>
        <dt>Дата реєстрації</dt>
        <dd>{formatCalendarDate(next.data.regDate)}</dd>
      </div>
      <div>
        <dt>Номер (орієнтовно)</dt>
        <dd>{next.data.regNumber}</dd>
      </div>
    </dl>
  );
}

type Props = { onCreated: (app: ApplicationDto) => void; manualDefaults?: ManualDefaults };

export function ApplicationForm({ onCreated, manualDefaults }: Props) {
  const user = useCurrentUser();
  const canRegisterManually = hasRegistrationRights(user);
  const today = kyivCalendarDate();
  const next = useNextNumber();
  const createAuto = useCreateApplication();
  const createManual = useCreateManualApplication();

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, Submitted>({
    resolver: useApplicationResolver(today),
    defaultValues: {
      customer: '',
      customerRepresentative: '',
      phone: '',
      email: '',
      objectAddress: '',
      manual: Boolean(manualDefaults),
      regDate: manualDefaults?.regDate ?? '',
      regSeq: '',
    },
  });
  const manual = watch('manual');

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (values.manual) {
        const { manual: _manual, ...data } = values;
        onCreated(await createManual.mutateAsync(data));
      } else {
        const { manual: _manual, ...data } = values;
        onCreated(await createAuto.mutateAsync(data));
      }
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'REG_NUMBER_TAKEN') {
        setError('regSeq', { message: apiError.message }, { shouldFocus: true });
        return;
      }
      // Server-side validation mirrors the client; show its field messages where they belong.
      const fieldErrors = (apiError.details as ServerErrorDetails | undefined)?.fieldErrors ?? {};
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages?.[0]) setError(field as FieldPath<FormValues>, { message: messages[0] });
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
            label="Представник замовника (необовʼязково)"
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
        {canRegisterManually && (
          <CheckboxField
            variant="switch"
            label="Ручне встановлення дати та номера реєстрації"
            hint="Для заяв, які були зареєстровані раніше, але ще не внесені до електронного реєстру"
            {...register('manual')}
          />
        )}
        {manual ? (
          <>
            <div className={styles.grid}>
              <TextField
                label="Дата реєстрації"
                type="date"
                max={today}
                error={errors.regDate?.message}
                {...register('regDate')}
              />
              <TextField
                label="Порядковий номер"
                inputMode="numeric"
                autoComplete="off"
                placeholder="14"
                hint="Лише цифри; «т» і рік додаються автоматично"
                error={errors.regSeq?.message}
                {...register('regSeq')}
              />
            </div>
            <ManualNumberStatus
              regDate={watch('regDate')}
              regSeq={watch('regSeq')}
              next={next.data}
            />
          </>
        ) : (
          <>
            <RegistrationPreview next={next} />
            <p className={styles.muted}>
              Дата й номер присвоюються автоматично під час збереження. Номер може відрізнятися від
              орієнтовного, якщо інший працівник зареєструє заяву раніше.
            </p>
          </>
        )}
      </fieldset>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {manual ? 'Внести заяву' : 'Зареєструвати заяву'}
        </Button>
      </div>
    </form>
  );
}
