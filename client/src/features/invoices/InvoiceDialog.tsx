import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ApplicationDto,
  formatHryvnias,
  INVOICE_WORK_GROUPS,
  type InvoiceDto,
  type InvoiceFileKind,
  invoiceTotals,
  type InvoiceWorkGroup,
  kyivCalendarDate,
} from '@tu-registry/shared';
import { type FocusEvent, useId, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { ScanPanel, useScanChange } from '@/features/applications';
import { documentStyles } from '@/features/documents';
import { tidyAmount } from '@/features/tuPayments';
import { INVOICE_WORK_GROUP_LABELS } from '@/shared/lib/labels';
import { notifySuccess } from '@/shared/lib/notify';
import { openPdf } from '@/shared/lib/pdf';
import { Button, Dialog, Icon, IconButton, TextField } from '@/shared/ui';
import { invoicesApi } from './api';
import {
  type FormData,
  formDefaults,
  type FormInput,
  formSchema,
  showServerError,
  typedAmount,
  WORK_SUGGESTIONS,
} from './invoiceForm';
import {
  useCreateInvoice,
  useRemoveInvoiceFile,
  useUpdateInvoice,
  useUploadInvoiceFile,
} from './queries';
import styles from './InvoiceDialog.module.scss';

const FORM_ID = 'invoice-form';

type Props = {
  app: ApplicationDto;
  /** The invoice to change; a new one when absent. */
  invoice?: InvoiceDto;
  onClose: () => void;
  onSaved: (saved: InvoiceDto) => void;
};

/**
 * «Рахунок» (2026-11-21): its number and date, then its works in three groups — each added with
 * «＋ Додати роботу» as a name and a sum — with each group's sum and the total of the connection
 * kept up to date; then the invoice's scan and the document it was made from. Files change only
 * on «Зберегти», after the fields; if a file fails, the invoice is already saved.
 */
export function InvoiceDialog({ app, invoice: initial, onClose, onSaved }: Props) {
  const [invoice, setInvoice] = useState(initial);
  // The files go to the invoice just saved: its id is known only after the fields are.
  const idRef = useRef(initial?.id);
  const listId = useId();
  const create = useCreateInvoice(app.id);
  const update = useUpdateInvoice(app.id);
  const upload = useUploadInvoiceFile(app.id);
  const removeFile = useRemoveInvoiceFile(app.id);
  const fileChange = (kind: InvoiceFileKind) => ({
    upload: (file: File, onProgress?: (percent: number) => void) =>
      upload.mutateAsync({ id: idRef.current!, kind, file, onProgress }),
    remove: () => removeFile.mutateAsync({ id: idRef.current!, kind }),
  });
  const scan = useScanChange(fileChange('scan'));
  const basis = useScanChange(fileChange('basis'));
  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: formDefaults(initial),
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'works' });
  const typed = watch('works');
  const totals = invoiceTotals(
    typed.map((work) => ({ group: work.group, amount: typedAmount(work.amount) })),
  );

  const save = (values: FormData) =>
    invoice
      ? update.mutateAsync({ id: invoice.id, input: { ...values, version: invoice.version } })
      : create.mutateAsync(values);

  const onSubmit = handleSubmit(async (values) => {
    let saved: InvoiceDto;
    try {
      saved = await save(values);
    } catch (error) {
      return showServerError(error, setError);
    }
    // From here on the dialog changes this invoice, whatever happens to the files.
    idRef.current = saved.id;
    setInvoice(saved);
    try {
      await scan.apply();
      await basis.apply();
    } catch {
      // The invoice stands, a file does not: the reason is in a notification already.
      if (!invoice) notifySuccess(`Рахунок № ${saved.invoiceNumber} збережено`);
      return;
    }
    onSaved(saved);
  });

  const view = (kind: InvoiceFileKind) => () =>
    openPdf(
      () => invoicesApi.file(app.id, invoice!.id, kind),
      invoice?.[kind]?.name ?? 'рахунок.pdf',
    );
  const worksError = errors.works?.root?.message ?? errors.works?.message;

  const group = (code: InvoiceWorkGroup) => {
    const title = INVOICE_WORK_GROUP_LABELS[code];
    const rows = fields
      .map((field, index) => ({ field, index }))
      .filter(({ field }) => field.group === code);
    return (
      <section key={code} aria-label={title} className={styles.group}>
        <div className={styles.groupHeader}>
          <h3 className={styles.groupTitle}>{title}</h3>
          <span className={styles.sum}>{formatHryvnias(totals[code])}</span>
        </div>
        {rows.length === 0 && <p className={documentStyles.muted}>Робіт ще не додано.</p>}
        {rows.map(({ field, index }, position) => (
          <div key={field.id} className={styles.work}>
            <TextField
              label={`Робота ${position + 1}`}
              autoComplete="off"
              list={`${listId}-${code}`}
              error={errors.works?.[index]?.name?.message}
              {...register(`works.${index}.name`)}
            />
            <TextField
              label="Вартість, грн"
              inputMode="decimal"
              autoComplete="off"
              placeholder="1 234,56"
              error={errors.works?.[index]?.amount?.message}
              {...register(`works.${index}.amount`, {
                onBlur: (event: FocusEvent<HTMLInputElement>) =>
                  setValue(`works.${index}.amount`, tidyAmount(event.target.value)),
              })}
            />
            <IconButton
              icon="trash"
              label={`Прибрати роботу ${position + 1}`}
              tone="danger"
              disabled={isSubmitting}
              onClick={() => remove(index)}
            />
          </div>
        ))}
        <datalist id={`${listId}-${code}`}>
          {WORK_SUGGESTIONS[code].map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div>
          <Button
            size="sm"
            disabled={isSubmitting}
            onClick={() => append({ group: code, name: '', amount: '' })}
          >
            <Icon name="plus" />
            Додати роботу
          </Button>
        </div>
      </section>
    );
  };

  return (
    <Dialog
      busy={isSubmitting}
      open
      size="xl"
      title={invoice ? `Рахунок № ${invoice.invoiceNumber}` : 'Новий рахунок'}
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          {invoice ? 'Зберегти' : 'Додати'}
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={documentStyles.formContents}>
        <div className={styles.pair}>
          <TextField
            label="№ рахунку"
            autoComplete="off"
            error={errors.invoiceNumber?.message}
            {...register('invoiceNumber')}
          />
          <TextField
            label="Дата рахунку"
            type="date"
            max={kyivCalendarDate()}
            hint="Не пізніше 10 робочих днів від узгодження проєкту"
            error={errors.invoiceDate?.message}
            {...register('invoiceDate')}
          />
        </div>
        {INVOICE_WORK_GROUPS.map(group)}
        {worksError && (
          <p role="alert" className={styles.error}>
            {worksError}
          </p>
        )}
        <p className={styles.total}>
          <span>Загальна вартість приєднання</span>
          <span>{formatHryvnias(totals.total)}</span>
        </p>
        <div className={styles.files}>
          <ScanPanel
            title="Скан рахунку"
            scan={invoice?.scan ?? null}
            scanChange={scan}
            onView={view('scan')}
            disabled={isSubmitting}
          />
          <ScanPanel
            title="Підстава рахунку"
            scan={invoice?.basis ?? null}
            scanChange={basis}
            onView={view('basis')}
            disabled={isSubmitting}
          />
        </div>
      </form>
    </Dialog>
  );
}
