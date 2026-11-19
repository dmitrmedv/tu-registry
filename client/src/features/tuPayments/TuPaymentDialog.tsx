import { zodResolver } from '@hookform/resolvers/zod';
import {
  kyivCalendarDate,
  type TechnicalConditionsDto,
  type TuPaymentDto,
  type TuPaymentScanKind,
} from '@tu-registry/shared';
import { type FocusEvent, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ScanPanel, useScanChange } from '@/features/applications';
import { documentStyles } from '@/features/documents';
import { openPdf } from '@/shared/lib/pdf';
import { Alert, Button, Dialog, TextField } from '@/shared/ui';
import { tuPaymentApi } from './api';
import { useRemoveTuPaymentScan, useSaveTuPayment, useUploadTuPaymentScan } from './queries';
import {
  type FormData,
  formDefaults,
  type FormInput,
  formSchema,
  showServerError,
  tidyAmount,
  toInput,
} from './tuPaymentForm';
import styles from './TuPaymentDialog.module.scss';

const FORM_ID = 'tu-payment-form';

type Props = {
  applicationId: string;
  tu: TechnicalConditionsDto;
  onClose: () => void;
  onSaved: (payment: TuPaymentDto) => void;
};

/**
 * «Оплата за технічні умови»: the invoice, then the payment with its receipt, then the act and
 * the month it went to accounting — one form, filled over time. Scans change only on «Зберегти»,
 * after the fields; if a scan fails, the fields are already saved and the dialog stays open.
 */
export function TuPaymentDialog({ applicationId, tu, onClose, onSaved }: Props) {
  const [payment, setPayment] = useState(tu.payment);
  const save = useSaveTuPayment(applicationId, tu.id);
  const upload = useUploadTuPaymentScan(applicationId, tu.id);
  const removeScan = useRemoveTuPaymentScan(applicationId, tu.id);
  const scanChange = (kind: TuPaymentScanKind) => ({
    upload: (file: File, onProgress?: (percent: number) => void) =>
      upload.mutateAsync({ kind, file, onProgress }),
    remove: () => removeScan.mutateAsync(kind),
  });
  const receipt = useScanChange(scanChange('receipt'));
  const act = useScanChange(scanChange('act'));
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: formDefaults(tu.payment),
  });

  const onSubmit = handleSubmit(async (values) => {
    let saved: TechnicalConditionsDto;
    try {
      saved = await save.mutateAsync(toInput(values, payment));
    } catch (error) {
      return showServerError(error, setError);
    }
    // From here on the dialog changes this payment, whatever happens to the scans.
    setPayment(saved.payment);
    try {
      await receipt.apply();
      await act.apply();
    } catch {
      return; // The reason is shown in the scan's panel.
    }
    onSaved(saved.payment!);
  });

  const view = (kind: TuPaymentScanKind, name: string) => () =>
    openPdf(() => tuPaymentApi.scanFile(applicationId, tu.id, kind), name);
  const today = kyivCalendarDate();

  return (
    <Dialog
      busy={isSubmitting}
      open
      size="lg"
      title={payment ? `Рахунок № ${payment.invoiceNumber}` : 'Новий рахунок'}
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          Зберегти
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={documentStyles.formContents}>
        {errors.root?.message && <Alert variant="error">{errors.root.message}</Alert>}
        <div className={styles.layout}>
          <TextField
            className={styles.number}
            label="№ рахунку"
            autoComplete="off"
            error={errors.invoiceNumber?.message}
            {...register('invoiceNumber')}
          />
          <TextField
            className={styles.date}
            label="Дата рахунку"
            type="date"
            max={today}
            error={errors.invoiceDate?.message}
            {...register('invoiceDate')}
          />
          <TextField
            className={styles.amount}
            label="Сума, грн"
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
            className={styles.paid}
            label="Дата оплати"
            type="date"
            max={today}
            error={errors.paidDate?.message}
            {...register('paidDate')}
          />
          <ScanPanel
            className={styles.receipt}
            title="Скан квитанції"
            scan={payment?.receiptScan ?? null}
            scanChange={receipt}
            onView={view('receipt', payment?.receiptScan?.name ?? '')}
            disabled={isSubmitting}
          />
          <TextField
            className={styles.month}
            label="Місяць передачі акта виконаних робіт"
            type="month"
            error={errors.actTransferMonth?.message}
            {...register('actTransferMonth')}
          />
          <ScanPanel
            className={styles.act}
            title="Скан акта виконаних робіт"
            scan={payment?.actScan ?? null}
            scanChange={act}
            onView={view('act', payment?.actScan?.name ?? '')}
            disabled={isSubmitting}
          />
        </div>
      </form>
    </Dialog>
  );
}
