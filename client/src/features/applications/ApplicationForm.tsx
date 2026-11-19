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
} from '@tu-registry/shared';
import { useEffect, useMemo, useState } from 'react';
import {
  type FieldErrors,
  type FieldPath,
  FormProvider,
  type Resolver,
  useForm,
} from 'react-hook-form';
import { useCurrentUser } from '@/features/auth';
import { useDepartments } from '@/features/departments';
import { toApiError } from '@/shared/api/apiError';
import { useFormDraft } from '@/shared/hooks/useFormDraft';
import { formatCalendarDate, formatDateTime } from '@/shared/lib/format';
import {
  Alert,
  Button,
  CheckboxField,
  LinkButton,
  SelectField,
  Spinner,
  TextField,
} from '@/shared/ui';
import { ApplicationContentFields } from './ApplicationContentFields';
import styles from './ApplicationForm.module.scss';
import { ManualNumberStatus } from './ManualNumberStatus';
import { useCreateApplication, useCreateManualApplication, useNextNumber } from './queries';
import { notifyError } from '@/shared/lib/notify';

type FormValues = CreateApplicationInput & { manual: boolean; regDate: string; regSeq: string };
type Submitted =
  (CreateApplicationData & { manual: false }) | (ManualApplicationData & { manual: true });

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

const EMPTY_VALUES: FormValues = {
  customer: '',
  customerRepresentative: '',
  phone: '',
  email: '',
  settlement: '',
  objectAddress: '',
  areaType: '' as FormValues['areaType'],
  gasificationType: '' as FormValues['gasificationType'],
  objectType: '' as FormValues['objectType'],
  objectCategory: '' as FormValues['objectCategory'],
  objectCategoryOther: '',
  accountNumber: '',
  comment: '',
  department: undefined,
  // Every new form starts in automatic mode, also right after a manual entry.
  manual: false,
  regDate: '',
  regSeq: '',
};

/** `onCreated` may be async (the page uploads the scan): the form stays busy until it ends. */
type Props = { onCreated: (app: ApplicationDto) => void | Promise<void> };

export function ApplicationForm({ onCreated }: Props) {
  const user = useCurrentUser();
  const canRegisterManually = hasRegistrationRights(user);
  const chooseDepartment = user.role === 'ADMIN';
  const departments = useDepartments();
  const today = kyivCalendarDate();
  const createAuto = useCreateApplication();
  const createManual = useCreateManualApplication();

  // An admin registers into their own department unless they pick another; a user always
  // into their own.
  const emptyValues = useMemo<FormValues>(
    () => ({ ...EMPTY_VALUES, department: user.department }),
    [user.department],
  );
  // Typed data survives a page reload; the draft belongs to this user only.
  const draft = useFormDraft(`new-application:${user.id}`, emptyValues);
  const [draftNoticeVisible, setDraftNoticeVisible] = useState(draft.restoredAt !== null);

  const form = useForm<FormValues, unknown, Submitted>({
    resolver: useApplicationResolver(today),
    // Rights may have been revoked since the draft was saved.
    defaultValues: {
      ...draft.initialValues,
      manual: canRegisterManually && draft.initialValues.manual,
      department: (chooseDepartment && draft.initialValues.department) || user.department,
    },
  });
  const {
    register,
    handleSubmit,
    setError,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = form;
  const manual = watch('manual');
  const department = watch('department') ?? user.department;
  const next = useNextNumber(department);

  useEffect(() => {
    const subscription = watch((values) => draft.save(values as FormValues));
    return () => subscription.unsubscribe();
  }, [watch, draft]);

  const discardDraft = () => {
    reset(emptyValues);
    draft.clear();
    setDraftNoticeVisible(false);
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      // Only an admin chooses; for a user the server takes their own department anyway.
      if (!chooseDepartment) delete values.department;
      if (values.manual) {
        const { manual: _manual, ...data } = values;
        const created = await createManual.mutateAsync(data);
        draft.clear();
        await onCreated(created);
      } else {
        const { manual: _manual, ...data } = values;
        const created = await createAuto.mutateAsync(data);
        draft.clear();
        await onCreated(created);
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
      notifyError(apiError.message);
    }
  });

  return (
    <FormProvider {...form}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {draftNoticeVisible && draft.restoredAt && (
          <Alert variant="info">
            <div className={styles.draftNotice}>
              <span>Відновлено незбережені дані від {formatDateTime(draft.restoredAt)}.</span>
              <Button size="sm" onClick={discardDraft}>
                Очистити форму
              </Button>
            </div>
          </Alert>
        )}

        <ApplicationContentFields />

        <fieldset className={styles.section}>
          <legend>Реєстрація</legend>
          {/* Rendered once the departments are loaded: an uncontrolled select takes its value from the form when it mounts, and must have that option by then. */}
          {chooseDepartment && !departments.isPending && (
            <SelectField
              label="Управління"
              options={departments.activeOptions}
              hint="Заява отримає номер цього управління й буде видна його працівникам"
              {...register('department')}
            />
          )}
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
                department={department}
              />
            </>
          ) : (
            <>
              <RegistrationPreview next={next} />
              <p className={styles.muted}>
                Дата й номер присвоюються автоматично під час збереження. Номер може відрізнятися
                від орієнтовного, якщо інший працівник зареєструє заяву раніше.
              </p>
            </>
          )}
        </fieldset>

        <div className={styles.actions}>
          {/* Leaving on purpose drops what was typed: the draft is for an unexpected reload. */}
          <LinkButton to="/" onClick={draft.clear}>
            Скасувати
          </LinkButton>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {manual ? 'Внести заяву' : 'Зареєструвати заяву'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
