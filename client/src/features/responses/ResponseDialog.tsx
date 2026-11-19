import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ApplicationDto,
  createResponseSchema,
  kyivCalendarDate,
  type ResponseDto,
} from '@tu-registry/shared';
import { useState } from 'react';
import { type FieldPath, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { DocumentScanField, documentStyles as styles } from '@/features/documents';
import { useEngineerOptions } from '@/features/engineers';
import { toApiError } from '@/shared/api/apiError';
import { notifySuccess } from '@/shared/lib/notify';
import { Alert, Button, Dialog, SelectField, Spinner, TextField } from '@/shared/ui';
import { responsesApi } from './api';
import {
  useCreateResponse,
  useRemoveResponseScan,
  useUpdateResponse,
  useUploadResponseScan,
} from './queries';

type FormInput = z.input<typeof createResponseSchema>;
type FormOutput = z.output<typeof createResponseSchema>;
type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

const FORM_ID = 'response-form';

type Props = {
  app: ApplicationDto;
  /** Editing this one; a new response when absent. */
  response?: ResponseDto;
  onClose: () => void;
  onSaved: (response: ResponseDto) => void;
};

/**
 * A response with its scan. The scan is a second request: if only it fails, the response is
 * already saved — the dialog switches to editing it, and saving again sends just the file.
 */
export function ResponseDialog({ app, response: initial, onClose, onSaved }: Props) {
  const [response, setResponse] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [scanError, setScanError] = useState<string>();
  const { query: engineers, options: engineerOptions } = useEngineerOptions(
    app.department,
    initial?.engineer.id,
  );
  const create = useCreateResponse(app.id);
  const update = useUpdateResponse(app.id);
  const uploadScan = useUploadResponseScan(app.id);
  const removeScan = useRemoveResponseScan(app.id);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createResponseSchema),
    defaultValues: {
      outgoingNumber: initial?.outgoingNumber ?? '',
      responseDate: initial?.responseDate ?? kyivCalendarDate(),
      engineer: initial?.engineer.id ?? '',
    },
  });

  const save = async (values: FormOutput) => {
    if (!response) return create.mutateAsync(values);
    const current: FormOutput = {
      outgoingNumber: response.outgoingNumber,
      responseDate: response.responseDate,
      engineer: response.engineer.id,
    };
    const changed = (Object.keys(current) as (keyof FormOutput)[]).filter(
      (field) => values[field] !== current[field],
    );
    if (changed.length === 0) return response;
    return update.mutateAsync({
      id: response.id,
      input: {
        version: response.version,
        ...Object.fromEntries(changed.map((field) => [field, values[field]])),
      },
    });
  };

  const onSubmit = handleSubmit(async (values) => {
    setScanError(undefined);
    let saved: ResponseDto;
    try {
      saved = await save(values);
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
        saved = await uploadScan.mutateAsync({ id: saved.id, file });
      } catch (error) {
        // The response stands: that is a notification; the scan's failure stays here.
        notifySuccess(`Відповідь № ${saved.outgoingNumber} збережено`);
        setResponse(saved);
        setScanError(`Скан не завантажено: ${toApiError(error).message}`);
        return;
      }
    }
    onSaved(saved);
  });

  return (
    <Dialog
      busy={isSubmitting}
      open
      title={initial ? `Відповідь № ${initial.outgoingNumber}` : 'Нова відповідь'}
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          {response ? 'Зберегти' : 'Додати'}
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={styles.formContents}>
        {errors.root?.message && <Alert variant="error">{errors.root.message}</Alert>}
        {scanError && <Alert variant="error">{scanError}</Alert>}
        <TextField
          label="Номер вихідного"
          autoComplete="off"
          error={errors.outgoingNumber?.message}
          {...register('outgoingNumber')}
        />
        <TextField
          label="Дата відповіді"
          type="date"
          max={kyivCalendarDate()}
          error={errors.responseDate?.message}
          {...register('responseDate')}
        />
        {engineers.isPending ? (
          // An uncontrolled select would otherwise settle on whichever option comes first.
          <Spinner label="Завантаження інженерів…" />
        ) : engineers.isError ? (
          <Alert variant="error">{toApiError(engineers.error).message}</Alert>
        ) : (
          <SelectField
            label="Інженер"
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
        <DocumentScanField
          title="Скан відповіді"
          scan={response?.scan ?? null}
          owner={response ? `відповіді № ${response.outgoingNumber}` : ''}
          file={file}
          onChange={setFile}
          load={() => responsesApi.scanFile(app.id, response!.id)}
          onRemove={async () => setResponse(await removeScan.mutateAsync(response!.id))}
          disabled={isSubmitting}
        />
      </form>
    </Dialog>
  );
}
