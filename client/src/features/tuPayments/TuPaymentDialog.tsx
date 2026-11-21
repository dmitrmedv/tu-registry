import { zodResolver } from '@hookform/resolvers/zod';
import {
  kyivCalendarDate,
  type TechnicalConditionsDto,
  type TuPaymentDto,
  type TuPaymentScanKind,
} from '@tu-registry/shared';
import { type FocusEvent, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ScanPanel, useScanChange } from '@/features/applications';
import { documentStyles } from '@/features/documents';
import { downloadFile, openPdf } from '@/shared/lib/pdf';
import { Button, Dialog, TextField } from '@/shared/ui';
import { tuPaymentApi } from './api';
import { SCAN_FIELDS } from './scanFields';
import {
  useNextContractNumber,
  useRemoveTuPaymentScan,
  useSaveTuPayment,
  useUploadTuPaymentScan,
} from './queries';
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
  const invoice = useScanChange(scanChange('invoice'));
  const receipt = useScanChange(scanChange('receipt'));
  const act = useScanChange(scanChange('act'));
  const contract = useScanChange(scanChange('contract'));
  const contractDocument = useScanChange(scanChange('contractDocument'));
  // Offered as soon as the dialog opens (2026-11-20); kept only with the contract's date.
  const offered = useNextContractNumber(applicationId, tu.id, !tu.payment?.contractNumber);
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: formDefaults(tu.payment),
  });
  const offeredNumber = offered.data;
  useEffect(() => {
    // Into the empty field only: what the user typed meanwhile stays.
    if (offeredNumber && !getValues('contractNumber')) {
      setValue('contractNumber', String(offeredNumber));
    }
  }, [offeredNumber, getValues, setValue]);

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
      await contractDocument.apply();
      await invoice.apply();
      await receipt.apply();
      await contract.apply();
      await act.apply();
    } catch {
      return; // The reason is in a notification.
    }
    onSaved(saved.payment!);
  });

  const files = { invoice, receipt, act, contract, contractDocument };
  const zone = (kind: TuPaymentScanKind, title: string) => {
    const field = SCAN_FIELDS[kind];
    const name = payment?.[field]?.name ?? '';
    return (
      <ScanPanel
        title={title}
        fileType={kind === 'contractDocument' ? 'docx' : 'pdf'}
        scan={payment?.[field] ?? null}
        scanChange={files[kind]}
        onView={() =>
          kind === 'contractDocument'
            ? downloadFile(() => tuPaymentApi.scanFile(applicationId, tu.id, kind), name)
            : openPdf(() => tuPaymentApi.scanFile(applicationId, tu.id, kind), name)
        }
        disabled={isSubmitting}
      />
    );
  };
  const today = kyivCalendarDate();
  /** A sum in hryvnias, tidied to «2 750,00» once the field is left. */
  const amountField = (name: 'amount' | 'paidAmount', label: string) => (
    <TextField
      label={label}
      inputMode="decimal"
      autoComplete="off"
      placeholder="1 234,56"
      error={errors[name]?.message}
      {...register(name, {
        onBlur: (event: FocusEvent<HTMLInputElement>) =>
          setValue(name, tidyAmount(event.target.value)),
      })}
    />
  );

  return (
    <Dialog
      busy={isSubmitting}
      open
      size="xl"
      title={payment ? `Рахунок № ${payment.invoiceNumber}` : 'Інформація про рахунок'}
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          Зберегти
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={documentStyles.formContents}>
        {/*
          The mock-ups of 2026-11-19 and 2026-11-20: each step's fields on the left, its files
          beside them — the invoice and the contract's Word document, the receipt and the signed
          contract, the act.
        */}
        <div className={styles.layout}>
          <div className={styles.row}>
            <div className={styles.fields}>
              <div className={styles.pair}>
                <TextField
                  label="№ рахунку"
                  autoComplete="off"
                  error={errors.invoiceNumber?.message}
                  {...register('invoiceNumber')}
                />
                {amountField('amount', 'Сума, грн')}
              </div>
              <TextField
                label="Дата рахунку"
                type="date"
                max={today}
                error={errors.invoiceDate?.message}
                {...register('invoiceDate')}
              />
              <div className={styles.pair}>
                <TextField
                  label="№ договору"
                  inputMode="numeric"
                  autoComplete="off"
                  hint="Зберігається лише з датою договору"
                  error={errors.contractNumber?.message}
                  {...register('contractNumber')}
                />
                <TextField
                  label="Дата договору"
                  type="date"
                  max={today}
                  error={errors.contractDate?.message}
                  {...register('contractDate')}
                />
              </div>
            </div>
            {zone('invoice', 'Скан рахунку')}
            {zone('contractDocument', 'Договір (DOCX)')}
          </div>
          <div className={styles.row}>
            <div className={styles.fields}>
              {amountField('paidAmount', 'Фактична оплата, грн')}
              <TextField
                label="Дата оплати"
                type="date"
                max={today}
                error={errors.paidDate?.message}
                {...register('paidDate')}
              />
            </div>
            {zone('receipt', 'Скан квитанції')}
            {zone('contract', 'Скан договору')}
          </div>
          <div className={styles.row}>
            <div className={styles.fields}>
              <TextField
                label="Місяць здачі акта"
                type="month"
                error={errors.actTransferMonth?.message}
                {...register('actTransferMonth')}
              />
            </div>
            {zone('act', 'Скан акта')}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
