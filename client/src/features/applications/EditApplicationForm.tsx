import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ApplicationDto,
  type Department,
  formatPhone,
  formatRegNumber,
  kyivCalendarDate,
  type ManualApplicationData,
  type ManualApplicationInput,
  manualApplicationSchema,
  type UpdateApplicationInput,
} from '@tu-registry/shared';
import { useState } from 'react';
import { type FieldPath, FormProvider, useForm } from 'react-hook-form';
import { useDepartments } from '@/features/departments';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { Alert, Button, ConfirmDialog, LinkButton, SelectField, TextField } from '@/shared/ui';
import { ApplicationContentFields } from './ApplicationContentFields';
import styles from './ApplicationForm.module.scss';
import { ManualNumberStatus } from './ManualNumberStatus';
import { useUpdateApplication } from './queries';
import { notifyError, notifyInfo } from '@/shared/lib/notify';

type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

function formValues(app: ApplicationDto): ManualApplicationInput {
  return {
    customer: app.customer,
    customerRepresentative: app.customerRepresentative ?? '',
    phone: formatPhone(app.phone),
    email: app.email ?? '',
    settlement: app.settlement ?? '',
    objectAddress: app.objectAddress,
    // Older records may have no area type yet: the form then asks for it.
    areaType: app.areaType ?? ('' as ManualApplicationInput['areaType']),
    // Records from before the choice: the form asks for it, like for the area type.
    gasificationType: app.gasificationType ?? ('' as ManualApplicationInput['gasificationType']),
    objectType: app.objectType,
    objectCategory: app.objectCategory,
    objectCategoryOther: app.objectCategoryOther ?? '',
    accountNumber: app.accountNumber ?? '',
    comment: app.comment ?? '',
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
  if (values.settlement !== app.settlement) changes.settlement = values.settlement;
  if (values.objectAddress !== app.objectAddress) changes.objectAddress = values.objectAddress;
  if (values.areaType !== app.areaType) changes.areaType = values.areaType;
  if (values.gasificationType !== app.gasificationType) {
    changes.gasificationType = values.gasificationType;
  }
  if (values.objectType !== app.objectType) changes.objectType = values.objectType;
  if (values.objectCategory !== app.objectCategory) changes.objectCategory = values.objectCategory;
  // The wording matters only for OTHER; for any other category the server clears it.
  if (
    values.objectCategory === 'OTHER' &&
    (values.objectCategoryOther ?? null) !== app.objectCategoryOther
  ) {
    changes.objectCategoryOther = values.objectCategoryOther ?? '';
  }
  // Hidden for new gasification: the server clears it then, so only a reconstruction sends it.
  if (
    values.gasificationType === 'RECONSTRUCTION' &&
    (values.accountNumber ?? null) !== app.accountNumber
  ) {
    changes.accountNumber = values.accountNumber ?? '';
  }
  if ((values.comment ?? null) !== app.comment) changes.comment = values.comment ?? '';
  if (withRegistration) {
    if (values.regDate !== app.regDate) changes.regDate = values.regDate;
    if (values.regSeq !== app.regSeq) changes.regSeq = values.regSeq;
  }
  return { ...changes, version: app.version };
}

type Props = {
  app: ApplicationDto;
  canEditRegistration: boolean;
  /** Admins may move the application to another department (its number moves with it). */
  canChangeDepartment: boolean;
  /** The scan change chosen beside the form: «Зберегти» applies it after the fields. */
  scanChanged: boolean;
  applyScan: () => Promise<void>;
  /** `fields`: whether the application's fields changed, not only its scan. */
  onSaved: (saved: { fields: boolean }) => void;
  /** Loads the latest version after a conflict; the form is then rebuilt from it. */
  onReload: () => void;
  cancelTo: string;
};

export function EditApplicationForm({
  app,
  canEditRegistration,
  canChangeDepartment,
  scanChanged,
  applyScan,
  onSaved,
  onReload,
  cancelTo,
}: Props) {
  const today = kyivCalendarDate();
  const update = useUpdateApplication(app.id);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<UpdateApplicationInput | null>(null);
  const departments = useDepartments();
  // Outside the form schema (it describes the application's content); admins only.
  const [department, setDepartment] = useState<Department>(app.department);

  const form = useForm<ManualApplicationInput, unknown, ManualApplicationData>({
    resolver: zodResolver(
      manualApplicationSchema(today, {
        // Migrated to OTHER without wording: editable as is until the category is touched.
        allowOtherWithoutWording: app.objectCategory === 'OTHER' && !app.objectCategoryOther,
      }),
    ),
    defaultValues: formValues(app),
  });
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = form;

  const save = async (changes: UpdateApplicationInput | null) => {
    try {
      if (changes) await update.mutateAsync(changes);
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
      return notifyError(apiError.message);
    } finally {
      setPending(null);
    }
    try {
      await applyScan();
    } catch {
      // The scan panel shows why; the fields, if any, are saved.
      return;
    }
    onSaved({ fields: changes !== null });
  };

  const onSubmit = handleSubmit(async (values) => {
    const changes = changedFields(app, values, canEditRegistration);
    if (department !== app.department) changes.department = department;
    const changedKeys = Object.keys(changes).filter((key) => key !== 'version');
    if (changedKeys.length === 0 && !scanChanged)
      return notifyInfo('Змін немає — зберігати нічого.');
    if (changedKeys.length === 0) return scanChanged ? save(null) : undefined;
    // Changing the registration date, number or department is confirmed separately.
    if (
      changes.regDate !== undefined ||
      changes.regSeq !== undefined ||
      changes.department !== undefined
    ) {
      return setPending(changes);
    }
    await save(changes);
  });

  const newDate = pending?.regDate ?? app.regDate;
  const newCode = departments.codeOf(pending?.department ?? app.department);
  const newNumber =
    pending && newCode !== undefined
      ? formatRegNumber(
          Number(String(newDate).slice(0, 4)),
          Number(pending.regSeq ?? app.regSeq),
          newCode,
        )
      : null;

  return (
    <FormProvider {...form}>
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

        <ApplicationContentFields />

        <fieldset className={styles.section}>
          <legend>Реєстрація</legend>
          {canEditRegistration ? (
            <>
              {canChangeDepartment && (
                <SelectField
                  label="Управління"
                  options={departments.optionsWith(app.department)}
                  hint="Номер отримає код нового управління й має бути там вільним"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value as Department)}
                />
              )}
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
                department={department}
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
            disabled={(!isDirty && department === app.department && !scanChanged) || conflict}
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
              {pending.department && (
                <>
                  <br />
                  Управління: {departments.nameOf(app.department)} →{' '}
                  {departments.nameOf(pending.department)}
                </>
              )}
            </p>
            <p>Зміну буде записано в історію заяви та журнал аудиту.</p>
          </ConfirmDialog>
        )}
      </form>
    </FormProvider>
  );
}
