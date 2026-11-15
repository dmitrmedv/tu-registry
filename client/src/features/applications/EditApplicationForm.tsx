import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ApplicationDto,
  formatPhone,
  formatRegNumber,
  kyivCalendarDate,
  type ManualApplicationData,
  type ManualApplicationInput,
  manualApplicationSchema,
  OBJECT_TYPES,
  type UpdateApplicationInput,
} from '@tu-registry/shared';
import { useState } from 'react';
import { type FieldPath, useForm } from 'react-hook-form';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { OBJECT_TYPE_LABELS } from '@/shared/lib/labels';
import { Alert, Button, ConfirmDialog, LinkButton, SelectField, TextField } from '@/shared/ui';
import styles from './ApplicationForm.module.scss';
import { ManualNumberStatus } from './ManualNumberStatus';
import { useUpdateApplication } from './queries';

const OBJECT_TYPE_OPTIONS = OBJECT_TYPES.map((type) => ({
  value: type,
  label: OBJECT_TYPE_LABELS[type],
}));

type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

function formValues(app: ApplicationDto): ManualApplicationInput {
  return {
    customer: app.customer,
    customerRepresentative: app.customerRepresentative ?? '',
    phone: formatPhone(app.phone),
    email: app.email ?? '',
    objectAddress: app.objectAddress,
    objectType: app.objectType,
    regDate: app.regDate,
    regSeq: String(app.regSeq),
  };
}

/** Only what actually changed goes to the server; "" clears an optional field. */
function changedFields(
  app: ApplicationDto,
  values: ManualApplicationData,
  withRegistration: boolean,
): UpdateApplicationInput {
  const changes: Partial<UpdateApplicationInput> = {};
  if (values.customer !== app.customer) changes.customer = values.customer;
  if ((values.customerRepresentative ?? null) !== app.customerRepresentative) {
    changes.customerRepresentative = values.customerRepresentative ?? '';
  }
  if (values.phone !== app.phone) changes.phone = values.phone;
  if ((values.email ?? null) !== app.email) changes.email = values.email ?? '';
  if (values.objectAddress !== app.objectAddress) changes.objectAddress = values.objectAddress;
  if (values.objectType !== app.objectType) changes.objectType = values.objectType;
  if (withRegistration) {
    if (values.regDate !== app.regDate) changes.regDate = values.regDate;
    if (values.regSeq !== app.regSeq) changes.regSeq = values.regSeq;
  }
  return { ...changes, version: app.version };
}

type Props = {
  app: ApplicationDto;
  canEditRegistration: boolean;
  onSaved: () => void;
  /** Loads the latest version after a conflict; the form is then rebuilt from it. */
  onReload: () => void;
  cancelTo: string;
};

export function EditApplicationForm({
  app,
  canEditRegistration,
  onSaved,
  onReload,
  cancelTo,
}: Props) {
  const today = kyivCalendarDate();
  const update = useUpdateApplication(app.id);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<UpdateApplicationInput | null>(null);
  const [nothingChanged, setNothingChanged] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ManualApplicationInput, unknown, ManualApplicationData>({
    resolver: zodResolver(manualApplicationSchema(today)),
    defaultValues: formValues(app),
  });

  const save = async (changes: UpdateApplicationInput) => {
    try {
      await update.mutateAsync(changes);
      onSaved();
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'VERSION_CONFLICT') return setConflict(true);
      if (apiError.code === 'REG_NUMBER_TAKEN') {
        return setError('regSeq', { message: apiError.message }, { shouldFocus: true });
      }
      const fieldErrors = (apiError.details as ServerErrorDetails | undefined)?.fieldErrors ?? {};
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages?.[0]) {
          setError(field as FieldPath<ManualApplicationInput>, { message: messages[0] });
        }
      }
      setError('root', { message: apiError.message });
    } finally {
      setPending(null);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    const changes = changedFields(app, values, canEditRegistration);
    const changedKeys = Object.keys(changes).filter((key) => key !== 'version');
    setNothingChanged(changedKeys.length === 0);
    if (changedKeys.length === 0) return;
    // Changing the registration date or number is confirmed separately.
    if (changes.regDate !== undefined || changes.regSeq !== undefined) return setPending(changes);
    await save(changes);
  });

  const newDate = pending?.regDate ?? app.regDate;
  const newNumber = pending
    ? formatRegNumber(Number(String(newDate).slice(0, 4)), Number(pending.regSeq ?? app.regSeq))
    : null;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {conflict && (
        <Alert variant="warning">
          <div className={styles.draftNotice}>
            <span>
              Заяву щойно змінив інший користувач. Завантажте актуальні дані — ваші незбережені
              правки буде втрачено.
            </span>
            <Button size="sm" onClick={onReload}>
              Завантажити актуальні дані
            </Button>
          </div>
        </Alert>
      )}
      {errors.root?.message && <Alert variant="error">{errors.root.message}</Alert>}
      {nothingChanged && <Alert variant="info">Змін немає — зберігати нічого.</Alert>}

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
        {canEditRegistration ? (
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
                hint="Лише цифри; «т» і рік додаються автоматично"
                error={errors.regSeq?.message}
                {...register('regSeq')}
              />
            </div>
            <ManualNumberStatus
              regDate={watch('regDate')}
              regSeq={String(watch('regSeq') ?? '')}
              next={undefined}
              excludeId={app.id}
            />
          </>
        ) : (
          <p className={styles.muted}>
            {app.regNumber} від {formatCalendarDate(app.regDate)}. Змінювати дату й номер можуть
            лише уповноважені користувачі у власних заявах та адміністратори.
          </p>
        )}
      </fieldset>

      <div className={styles.actions}>
        <LinkButton to={cancelTo}>Скасувати</LinkButton>
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          disabled={!isDirty || conflict}
        >
          Зберегти
        </Button>
      </div>

      {pending && (
        <ConfirmDialog
          open
          title="Змінити реєстраційні дані?"
          confirmLabel="Змінити"
          loading={update.isPending}
          onCancel={() => setPending(null)}
          onConfirm={() => save(pending)}
        >
          <p>
            Номер: <strong>{app.regNumber}</strong> → <strong>{newNumber}</strong>
            <br />
            Дата реєстрації: {formatCalendarDate(app.regDate)} →{' '}
            {formatCalendarDate(String(newDate))}
          </p>
          <p>Зміну буде записано в історію заяви та журнал аудиту.</p>
        </ConfirmDialog>
      )}
    </form>
  );
}
