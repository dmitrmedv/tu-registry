import { zodResolver } from '@hookform/resolvers/zod';
import { type EstimateDto, type EstimateFileKind, kyivCalendarDate } from '@tu-registry/shared';
import { type FocusEvent, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ScanPanel, useScanChange } from '@/features/applications';
import { documentStyles } from '@/features/documents';
import { tidyAmount } from '@/features/tuPayments';
import { notifySuccess } from '@/shared/lib/notify';
import { downloadFile, openPdf } from '@/shared/lib/pdf';
import { Button, Dialog, TextField } from '@/shared/ui';
import { estimatesApi } from './api';
import {
  type FormData,
  formDefaults,
  type FormInput,
  formSchema,
  showServerError,
} from './estimateForm';
import {
  useCreateEstimate,
  useRemoveEstimateFile,
  useUpdateEstimate,
  useUploadEstimateFile,
} from './queries';
import styles from './EstimateDialog.module.scss';
import { useDayOff } from '@/features/calendar';

const FORM_ID = 'estimate-form';

type Props = {
  applicationId: string;
  /** The estimate to change; a new one (the first, or a recalculation) when absent. */
  estimate?: EstimateDto;
  /** A new estimate replaces the current one. */
  recalculation?: boolean;
  onClose: () => void;
  onSaved: (saved: EstimateDto) => void;
};

/**
 * «Кошторис» (2026-11-21): the date it was checked and its sum, with its scan and IMD check
 * file. Files change only on «Зберегти», after the fields; if a file fails, the estimate is
 * already saved and the dialog stays open on it.
 */
export function EstimateDialog({
  applicationId,
  estimate: initial,
  recalculation,
  onClose,
  onSaved,
}: Props) {
  const [estimate, setEstimate] = useState(initial);
  // The files go to the estimate just saved: its id is known only after the fields are.
  const idRef = useRef(initial?.id);
  const create = useCreateEstimate(applicationId);
  const update = useUpdateEstimate(applicationId);
  const uploadFile = useUploadEstimateFile(applicationId);
  const removeFile = useRemoveEstimateFile(applicationId);
  const fileChange = (kind: EstimateFileKind) => ({
    upload: (file: File, onProgress?: (percent: number) => void) =>
      uploadFile.mutateAsync({ id: idRef.current!, kind, file, onProgress }),
    remove: () => removeFile.mutateAsync({ id: idRef.current!, kind }),
  });
  const scan = useScanChange(fileChange('scan'));
  const imd = useScanChange(fileChange('imd'));
  const dayOff = useDayOff();
  const {
    register,
    watch,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: formDefaults(initial),
  });

  const save = async (values: FormData) => {
    if (!estimate) return create.mutateAsync(values);
    const unchanged =
      values.checkDate === estimate.checkDate &&
      values.amount === estimate.amount &&
      values.subcontractAmount === estimate.subcontractAmount;
    return unchanged
      ? estimate
      : update.mutateAsync({ id: estimate.id, input: { ...values, version: estimate.version } });
  };

  const onSubmit = handleSubmit(async (values) => {
    let saved: EstimateDto;
    try {
      saved = await save(values);
    } catch (error) {
      return showServerError(error, setError);
    }
    // From here on the dialog changes this estimate, whatever happens to the files.
    idRef.current = saved.id;
    setEstimate(saved);
    try {
      await scan.apply();
      await imd.apply();
    } catch {
      // The estimate stands, a file does not: the reason is in a notification already.
      if (!estimate) notifySuccess('Кошторис збережено');
      return;
    }
    onSaved(saved);
  });

  const viewFile = (kind: EstimateFileKind) => () => {
    const load = () => estimatesApi.file(applicationId, estimate!.id, kind);
    return kind === 'imd'
      ? downloadFile(load, estimate?.imd?.name ?? 'кошторис.imd')
      : openPdf(load, estimate?.scan?.name ?? 'кошторис.pdf');
  };

  return (
    <Dialog
      busy={isSubmitting}
      open
      size="xl"
      title={estimate ? 'Кошторис' : recalculation ? 'Перерахований кошторис' : 'Новий кошторис'}
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          {estimate ? 'Зберегти' : 'Додати'}
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={documentStyles.formContents}>
        {recalculation && !estimate && (
          <p className={documentStyles.muted}>
            Чинний кошторис лишиться в картці з позначкою «Перераховано»; проєкт не зміниться.
          </p>
        )}
        <div className={styles.row}>
          <div className={styles.fields}>
            <TextField
              label="Дата перевірки кошторису"
              type="date"
              max={kyivCalendarDate()}
              error={errors.checkDate?.message ?? dayOff(watch('checkDate'))}
              {...register('checkDate')}
            />
            <TextField
              label="Сума кошторису, грн"
              amount
              inputMode="decimal"
              autoComplete="off"
              placeholder="1 234,56"
              error={errors.amount?.message}
              {...register('amount', {
                onBlur: (event: FocusEvent<HTMLInputElement>) =>
                  setValue('amount', tidyAmount(event.target.value)),
              })}
            />
            <TextField
              label="Сума по кошторису (субпідряд), грн"
              amount
              inputMode="decimal"
              autoComplete="off"
              placeholder="1 234,56"
              error={errors.subcontractAmount?.message}
              {...register('subcontractAmount', {
                onBlur: (event: FocusEvent<HTMLInputElement>) =>
                  setValue('subcontractAmount', tidyAmount(event.target.value)),
              })}
            />
          </div>
          <div className={styles.files}>
            <ScanPanel
              title="Скан кошторису"
              scan={estimate?.scan ?? null}
              scanChange={scan}
              onView={viewFile('scan')}
              disabled={isSubmitting}
            />
            <ScanPanel
              title="Файл перевірки (IMD)"
              fileType="imd"
              scan={estimate?.imd ?? null}
              scanChange={imd}
              onView={viewFile('imd')}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
