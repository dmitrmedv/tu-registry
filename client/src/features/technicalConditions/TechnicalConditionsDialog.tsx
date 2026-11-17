import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ApplicationDto,
  CONNECTION_POINTS,
  CONNECTION_TYPES,
  createTechnicalConditionsSchema,
  fullAddress,
  GAS_PRESSURES,
  kyivCalendarDate,
  type TechnicalConditionsDto,
} from '@tu-registry/shared';
import { useState } from 'react';
import { type FieldPath, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ScanDropzone } from '@/features/applications';
import { CurrentScan, documentStyles as styles } from '@/features/documents';
import { useEngineerOptions } from '@/features/engineers';
import { toApiError } from '@/shared/api/apiError';
import {
  CONNECTION_POINT_LABELS,
  CONNECTION_TYPE_LABELS,
  GAS_PRESSURE_LABELS,
} from '@/shared/lib/labels';
import { Alert, Button, ChoiceField, Dialog, SelectField, Spinner, TextField } from '@/shared/ui';
import { technicalConditionsApi } from './api';
import {
  useCreateTechnicalConditions,
  useRemoveTechnicalConditionsScan,
  useUpdateTechnicalConditions,
  useUploadTechnicalConditionsScan,
} from './queries';

// The API takes the application's customer and address when they are missing; the form always
// sends them, filled in from the application.
const formSchema = createTechnicalConditionsSchema.required({ customer: true, address: true });
type FormInput = z.input<typeof formSchema>;
type FormData = z.output<typeof formSchema>;
type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

const FORM_ID = 'technical-conditions-form';
const options = <Code extends string>(codes: readonly Code[], labels: Record<Code, string>) =>
  codes.map((code) => ({ value: code, label: labels[code] }));

type Props = {
  app: ApplicationDto;
  /** Editing these; new technical conditions when absent. */
  technicalConditions?: TechnicalConditionsDto;
  onClose: () => void;
  onSaved: (saved: TechnicalConditionsDto) => void;
};

/**
 * Technical conditions with their scan. The scan is a second request: if only it fails, the
 * conditions are already saved — the dialog switches to editing them, and saving again sends
 * just the file.
 */
export function TechnicalConditionsDialog({
  app,
  technicalConditions: initial,
  onClose,
  onSaved,
}: Props) {
  const [saved, setSaved] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [scanError, setScanError] = useState<string>();
  const { query: engineers, options: engineerOptions } = useEngineerOptions(
    app.department,
    initial?.engineer.id,
  );
  const create = useCreateTechnicalConditions(app.id);
  const update = useUpdateTechnicalConditions(app.id);
  const uploadScan = useUploadTechnicalConditionsScan(app.id);
  const removeScan = useRemoveTechnicalConditionsScan(app.id);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tuNumber: initial?.tuNumber ?? '',
      preparedDate: initial?.preparedDate ?? kyivCalendarDate(),
      customer: initial?.customer ?? app.customer,
      address: initial?.address ?? fullAddress(app.settlement, app.objectAddress),
      engineer: initial?.engineer.id ?? '',
      // As people write it: "2,5".
      gasFlow: initial ? String(initial.gasFlow).replace('.', ',') : '',
      connectionType: initial?.connectionType,
      gasPressure: initial?.gasPressure,
      connectionPoint: initial?.connectionPoint,
    },
  });

  const save = async (values: FormData) => {
    if (!saved) return create.mutateAsync(values);
    const current: FormData = {
      tuNumber: saved.tuNumber,
      preparedDate: saved.preparedDate,
      customer: saved.customer,
      address: saved.address,
      engineer: saved.engineer.id,
      gasFlow: saved.gasFlow,
      connectionType: saved.connectionType,
      gasPressure: saved.gasPressure,
      connectionPoint: saved.connectionPoint,
    };
    const changed = (Object.keys(current) as (keyof FormData)[]).filter(
      (field) => values[field] !== current[field],
    );
    if (changed.length === 0) return saved;
    return update.mutateAsync({
      id: saved.id,
      input: {
        version: saved.version,
        ...Object.fromEntries(changed.map((field) => [field, values[field]])),
      },
    });
  };

  const onSubmit = handleSubmit(async (values) => {
    setScanError(undefined);
    let result: TechnicalConditionsDto;
    try {
      result = await save(values);
    } catch (error) {
      const apiError = toApiError(error);
      const fieldErrors = (apiError.details as ServerErrorDetails | undefined)?.fieldErrors ?? {};
      const fields = Object.entries(fieldErrors);
      for (const [field, messages] of fields) {
        if (messages?.[0]) setError(field as FieldPath<FormInput>, { message: messages[0] });
      }
      if (fields.length === 0) setError('root', { message: apiError.message });
      return;
    }
    if (file) {
      try {
        result = await uploadScan.mutateAsync({ id: result.id, file });
      } catch (error) {
        setSaved(result);
        setScanError(`ТУ збережено, але скан не завантажено: ${toApiError(error).message}`);
        return;
      }
    }
    onSaved(result);
  });

  return (
    <Dialog
      busy={isSubmitting}
      open
      title={initial ? `Технічні умови № ${initial.tuNumber}` : 'Нові технічні умови'}
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          {saved ? 'Зберегти' : 'Додати'}
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={styles.formContents}>
        {errors.root?.message && <Alert variant="error">{errors.root.message}</Alert>}
        {scanError && <Alert variant="error">{scanError}</Alert>}
        <TextField
          label="Реєстраційний номер ТУ"
          autoComplete="off"
          error={errors.tuNumber?.message}
          {...register('tuNumber')}
        />
        <TextField
          label="Дата підготовки ТУ"
          type="date"
          max={kyivCalendarDate()}
          error={errors.preparedDate?.message}
          {...register('preparedDate')}
        />
        <TextField
          label="Замовник за ТУ"
          autoComplete="off"
          hint="Із заяви; змініть, якщо в ТУ записано інакше"
          error={errors.customer?.message}
          {...register('customer')}
        />
        <TextField
          label="Адреса за ТУ"
          autoComplete="off"
          hint="Із заяви: населений пункт і адреса"
          error={errors.address?.message}
          {...register('address')}
        />
        {engineers.isPending ? (
          // An uncontrolled select would otherwise settle on whichever option comes first.
          <Spinner label="Завантаження інженерів…" />
        ) : engineers.isError ? (
          <Alert variant="error">{toApiError(engineers.error).message}</Alert>
        ) : (
          <SelectField
            label="Інженер, який розробив ТУ"
            options={engineerOptions}
            hint={
              engineerOptions.length === 1
                ? 'В управлінні ще немає інженерів: їх додає адміністратор'
                : undefined
            }
            error={errors.engineer?.message}
            {...register('engineer')}
          />
        )}
        <TextField
          label="Витрати газу, м³/год"
          inputMode="decimal"
          autoComplete="off"
          hint="Наприклад 2,5; до трьох знаків після коми"
          error={errors.gasFlow?.message}
          {...register('gasFlow')}
        />
        <ChoiceField
          legend="Тип приєднання"
          options={options(CONNECTION_TYPES, CONNECTION_TYPE_LABELS)}
          error={errors.connectionType?.message}
          {...register('connectionType')}
        />
        <ChoiceField
          legend="Тиск газу"
          options={options(GAS_PRESSURES, GAS_PRESSURE_LABELS)}
          error={errors.gasPressure?.message}
          {...register('gasPressure')}
        />
        <ChoiceField
          legend="Точка приєднання"
          options={options(CONNECTION_POINTS, CONNECTION_POINT_LABELS)}
          error={errors.connectionPoint?.message}
          {...register('connectionPoint')}
        />
        <div>
          {saved && (
            <CurrentScan
              scan={saved.scan}
              owner={`ТУ № ${saved.tuNumber}`}
              load={() => technicalConditionsApi.scanFile(app.id, saved.id)}
              onRemove={async () => setSaved(await removeScan.mutateAsync(saved.id))}
              disabled={isSubmitting}
            />
          )}
          <p className={styles.muted}>
            {saved?.scan
              ? 'Новий файл замінить скан; попередній лишиться в історії ТУ.'
              : 'Скан технічних умов (PDF, необовʼязково)'}
          </p>
          <ScanDropzone
            file={file}
            onChange={setFile}
            chooseLabel={saved?.scan ? 'Замінити скан' : 'Обрати файл'}
            disabled={isSubmitting}
          />
        </div>
      </form>
    </Dialog>
  );
}
