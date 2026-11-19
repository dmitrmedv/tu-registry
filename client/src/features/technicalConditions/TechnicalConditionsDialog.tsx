import { zodResolver } from '@hookform/resolvers/zod';
import type { ApplicationDto, TechnicalConditionsDto } from '@tu-registry/shared';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { ScanDropzone } from '@/features/applications';
import { documentStyles as styles } from '@/features/documents';
import { toApiError } from '@/shared/api/apiError';
import { notifySuccess } from '@/shared/lib/notify';
import { Alert, Button, Dialog } from '@/shared/ui';
import {
  useCreateTechnicalConditions,
  useUpdateTechnicalConditions,
  useUploadTechnicalConditionsScan,
} from './queries';
import {
  changedFields,
  type FormData,
  formDefaults,
  type FormInput,
  formSchema,
  showServerError,
} from './technicalConditionsForm';
import { ConnectionFields, CustomerFields, DocumentFields } from './TechnicalConditionsFields';

const FORM_ID = 'technical-conditions-form';

type Props = {
  app: ApplicationDto;
  onClose: () => void;
  onSaved: (saved: TechnicalConditionsDto) => void;
};

/**
 * New technical conditions with their scan; saved ones are edited on their own page. The scan
 * is a second request: if only it fails, the conditions are already saved — the dialog then
 * edits them, and saving again sends just the file.
 */
export function TechnicalConditionsDialog({ app, onClose, onSaved }: Props) {
  const [saved, setSaved] = useState<TechnicalConditionsDto>();
  const [file, setFile] = useState<File | null>(null);
  const [scanError, setScanError] = useState<string>();
  const create = useCreateTechnicalConditions(app.id);
  const update = useUpdateTechnicalConditions(app.id);
  const uploadScan = useUploadTechnicalConditionsScan(app.id);
  const form = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: formDefaults(app),
  });
  const {
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  const save = async (values: FormData) => {
    if (!saved) return create.mutateAsync(values);
    const input = changedFields(saved, values);
    return input ? update.mutateAsync({ id: saved.id, input }) : saved;
  };

  const onSubmit = handleSubmit(async (values) => {
    setScanError(undefined);
    let result: TechnicalConditionsDto;
    try {
      result = await save(values);
    } catch (error) {
      return showServerError(error, setError);
    }
    if (file) {
      try {
        result = await uploadScan.mutateAsync({ id: result.id, file });
      } catch (error) {
        // The conditions stand: that is a notification; the scan's failure stays here.
        notifySuccess(`Технічні умови № ${result.tuNumber} збережено`);
        setSaved(result);
        setScanError(`Скан не завантажено: ${toApiError(error).message}`);
        return;
      }
    }
    onSaved(result);
  });

  return (
    <Dialog
      busy={isSubmitting}
      open
      title={saved ? `Технічні умови № ${saved.tuNumber}` : 'Нові технічні умови'}
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          {saved ? 'Зберегти' : 'Додати'}
        </Button>
      }
    >
      <FormProvider {...form}>
        <form id={FORM_ID} onSubmit={onSubmit} noValidate className={styles.formContents}>
          {errors.root?.message && <Alert variant="error">{errors.root.message}</Alert>}
          {scanError && <Alert variant="error">{scanError}</Alert>}
          <DocumentFields department={app.department} />
          <CustomerFields />
          <ConnectionFields />
          <ScanDropzone
            title="Скан технічних умов"
            file={file}
            onChange={setFile}
            disabled={isSubmitting}
          />
        </form>
      </FormProvider>
    </Dialog>
  );
}
