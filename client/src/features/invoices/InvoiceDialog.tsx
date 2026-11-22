import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ApplicationDto,
  formatHryvnias,
  EARTHWORKS_CONNECTION_POINT,
  INVOICE_DEADLINE_DAYS,
  type InvoiceDto,
  type InvoiceFileKind,
  kyivCalendarDate,
  type ProjectDto,
  invoiceNumberText,
} from '@tu-registry/shared';
import clsx from 'clsx';
import { type ChangeEvent, type FocusEvent, useId, useRef, useState } from 'react';
import { type FieldPath, useFieldArray, useForm } from 'react-hook-form';
import { ScanPanel, useScanChange } from '@/features/applications';
import { documentStyles } from '@/features/documents';
import { useEstimates } from '@/features/estimates';
import { useInvoiceTerm, useProjects } from '@/features/projects';
import { useTechnicalConditions } from '@/features/technicalConditions';
import { formatAmountInput, tidyAmount } from '@/features/tuPayments';
import { formatCalendarDate } from '@/shared/lib/format';
import { notifySuccess } from '@/shared/lib/notify';
import { openPdf } from '@/shared/lib/pdf';
import { Button, Dialog, Icon, IconButton, Spinner, TextAreaField, TextField } from '@/shared/ui';
import { invoicesApi } from './api';
import {
  CONSTRUCTION_SUGGESTIONS,
  EARTHWORKS_SUGGESTIONS,
  type FormData,
  formDefaults,
  type FormInput,
  formSchema,
  isByEstimate,
  nextAgreementNumber,
  nextInvoiceNumber,
  showServerError,
  toInput,
  typedAmount,
  WORK_PLAN_SUGGESTIONS,
} from './invoiceForm';
import {
  useCreateInvoice,
  useInvoices,
  useRemoveInvoiceFile,
  useUpdateInvoice,
  useUploadInvoiceFile,
} from './queries';
import styles from './InvoiceDialog.module.scss';
import { useDayOff } from '@/features/calendar';

const FORM_ID = 'invoice-form';
/** The lists of works (mock-up of 2026-11-22), each added with «＋ Додати роботу». */
const LISTS = {
  works: 'Будівельно-монтажні роботи та врізання',
  workPlan: 'ПВР',
  earthworks: 'Дозволи на земляні роботи',
} as const;
type ListName = keyof typeof LISTS;

type Props = {
  app: ApplicationDto;
  /** The invoice to change; a new one when absent. */
  invoice?: InvoiceDto;
  onClose: () => void;
  onSaved: (saved: InvoiceDto) => void;
};

/**
 * The note beside the date (2026-11-22): the working days from the project's approval, counted as
 * in Excel — green within the term, red past it — or what is wrong with the date.
 */
function dateNote(
  date: string,
  project: ProjectDto | undefined,
  workingDays?: number,
  dayOff?: string,
) {
  // A day off by the calendar, said in the note's place as soon as it is picked (2026-11-22).
  if (dayOff) return { tone: 'error' as const, text: dayOff };
  if (!project || !date) return null;
  if (date < project.approvalDate) {
    return {
      tone: 'error' as const,
      text: `Раніше дати узгодження проєкту (${formatCalendarDate(project.approvalDate)})`,
    };
  }
  return {
    tone:
      workingDays !== undefined && workingDays > INVOICE_DEADLINE_DAYS
        ? ('error' as const)
        : ('ok' as const),
    text: `Кількість днів з дня узгодження — ${workingDays ?? '…'}`,
  };
}

/**
 * «Розрахунок» (mock-up of 2026-11-22). On the left: «До додаткової угоди №» (the next agreement
 * by default) and the total; the number (given later by the accounts department) and the date,
 * with the working days from the approval beside the date, green within the term, red past it; then three
 * lists of works, empty at first — construction with the tie-in, the work plan (ПВР) and the
 * earthworks permits, only where the connection is underground (2026-11-22). On the
 * right, staying in place: the basis (the scan was dropped, 2026-11-22). Files change only on
 * «Зберегти», after the fields; if a file fails, the invoice is already saved.
 */
export function InvoiceDialog(props: Props) {
  const projects = useProjects(props.app.id);
  const invoices = useInvoices(props.app.id);
  const estimates = useEstimates(props.app.id);
  const tus = useTechnicalConditions(props.app.id);
  if (projects.isPending || invoices.isPending || estimates.isPending || tus.isPending) {
    return (
      <Dialog
        open
        title={props.invoice ? 'Розрахунок' : 'Новий розрахунок'}
        onClose={props.onClose}
      >
        <Spinner label="Завантаження проєкту…" />
      </Dialog>
    );
  }
  const project = props.invoice
    ? projects.data?.find((row) => row.id === props.invoice!.projectId)
    : projects.data?.find((row) => !row.cancellation);
  const tu = tus.data?.find((row) => row.id === project?.technicalConditionsId);
  const estimate = estimates.data?.find((row) => row.projectId === project?.id && !row.superseded);
  return (
    <InvoiceForm
      {...props}
      project={project}
      nextAgreement={nextAgreementNumber(invoices.data ?? [])}
      nextNumber={nextInvoiceNumber(invoices.data ?? [])}
      estimateAmount={estimate?.amount ?? null}
      underground={tu?.connectionPoint === EARTHWORKS_CONNECTION_POINT}
    />
  );
}

function InvoiceForm({
  app,
  invoice: initial,
  project,
  nextAgreement,
  nextNumber,
  estimateAmount,
  underground,
  onClose,
  onSaved,
}: Props & {
  project?: ProjectDto;
  nextAgreement: number;
  nextNumber: string;
  /** The current estimate's sum: for «…за кошторисом» when it is chosen. */
  estimateAmount: number | null;
  underground: boolean;
}) {
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
  const basis = useScanChange(fileChange('basis'));
  const defaults = formDefaults(initial, nextAgreement, nextNumber);
  // The permits only underground; an invoice that has some keeps the list, to clear it.
  const shown = (Object.keys(LISTS) as ListName[]).filter(
    (name) => name !== 'earthworks' || underground || defaults.earthworks.length > 0,
  );
  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  });
  const lists = {
    works: useFieldArray({ control, name: 'works' }),
    workPlan: useFieldArray({ control, name: 'workPlan' }),
    earthworks: useFieldArray({ control, name: 'earthworks' }),
  };
  const suggestions: Record<ListName, string[]> = {
    works: CONSTRUCTION_SUGGESTIONS,
    workPlan: WORK_PLAN_SUGGESTIONS,
    earthworks: EARTHWORKS_SUGGESTIONS,
  };
  const typed = watch();
  const dayOff = useDayOff();
  const total = [
    ...(typed.works ?? []),
    ...(typed.workPlan ?? []),
    ...(typed.earthworks ?? []),
  ].reduce<number>((sum, work) => sum + Math.round(typedAmount(work.amount) * 100), 0);
  const date = String(typed.invoiceDate ?? '');
  const dateOff = dayOff(date);
  const term = useInvoiceTerm(
    app.id,
    project?.id,
    project && !dateOff && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= project.approvalDate
      ? date
      : undefined,
  );
  const note = dateNote(date, project, term.data?.workingDays, dateOff);

  const save = (values: FormData) => {
    const input = toInput(values);
    return invoice
      ? update.mutateAsync({ id: invoice.id, input: { ...input, version: invoice.version } })
      : create.mutateAsync(input);
  };

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
      await basis.apply();
    } catch {
      // The invoice stands, a file does not: the reason is in a notification already.
      if (!invoice) notifySuccess(`Розрахунок ${invoiceNumberText(saved.invoiceNumber)} збережено`);
      return;
    }
    onSaved(saved);
  });

  const view = (kind: InvoiceFileKind) => () =>
    openPdf(
      () => invoicesApi.file(app.id, invoice!.id, kind),
      invoice?.[kind]?.name ?? 'розрахунок.pdf',
    );

  const amountProps = (name: FieldPath<FormInput>) =>
    register(name, {
      onBlur: (event: FocusEvent<HTMLInputElement>) =>
        setValue(name, tidyAmount(event.target.value)),
    });

  /** «…за кошторисом» chosen with no sum yet: the current estimate's sum by default. */
  const fillFromEstimate = (name: ListName, index: number, work: string) => {
    if (name !== 'works' || estimateAmount === null || !isByEstimate(work)) return;
    if (String(getValues(`works.${index}.amount`) ?? '').trim() !== '') return;
    setValue(`works.${index}.amount`, formatAmountInput(estimateAmount));
  };

  /** A list of works: a name (with suggestions) and a sum each, «＋ Додати роботу» under it. */
  const workList = (name: ListName) => {
    const { fields, append, remove } = lists[name];
    const listError = errors[name]?.root?.message ?? errors[name]?.message;
    return (
      <section key={name} aria-label={LISTS[name]} className={styles.group}>
        <h3 className={styles.groupTitle}>{LISTS[name]}</h3>
        {fields.length === 0 && (
          <p className={clsx(documentStyles.muted, styles.empty)}>Робіт ще не додано.</p>
        )}
        {fields.map((field, index) => (
          <div key={field.id} className={styles.work}>
            <TextField
              label={`Робота ${index + 1}`}
              autoComplete="off"
              list={`${listId}-${name}`}
              error={errors[name]?.[index]?.name?.message}
              {...register(`${name}.${index}.name`, {
                onChange: (event: ChangeEvent<HTMLInputElement>) =>
                  fillFromEstimate(name, index, event.target.value),
              })}
            />
            <TextField
              label="Вартість, грн"
              amount
              inputMode="decimal"
              autoComplete="off"
              placeholder="1 234,56"
              error={errors[name]?.[index]?.amount?.message}
              {...amountProps(`${name}.${index}.amount`)}
            />
            <IconButton
              icon="trash"
              label={`Прибрати роботу ${index + 1}`}
              tone="danger"
              disabled={isSubmitting}
              onClick={() => remove(index)}
            />
          </div>
        ))}
        <datalist id={`${listId}-${name}`}>
          {suggestions[name].map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <div>
          <Button
            size="sm"
            disabled={isSubmitting}
            onClick={() => append({ name: '', amount: '' })}
          >
            <Icon name="plus" />
            Додати роботу
          </Button>
        </div>
        {listError && (
          <p role="alert" className={styles.error}>
            {listError}
          </p>
        )}
      </section>
    );
  };

  return (
    <Dialog
      busy={isSubmitting}
      open
      size="2xl"
      title={
        invoice ? `Розрахунок ${invoiceNumberText(invoice.invoiceNumber)}` : 'Новий розрахунок'
      }
      onClose={onClose}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" loading={isSubmitting}>
          {invoice ? 'Зберегти' : 'Додати'}
        </Button>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.top}>
            <TextField
              label="До додаткової угоди №"
              className={styles.agreement}
              inputMode="numeric"
              autoComplete="off"
              error={errors.agreementNumber?.message}
              {...register('agreementNumber')}
            />
            <p className={styles.total}>
              <span>Загальна вартість</span>
              <span className={styles.totalSum}>{formatHryvnias(total / 100)}</span>
            </p>
          </div>
          <div className={styles.head}>
            <TextField
              label="№ розрахунку"
              className={styles.invoiceNumber}
              autoComplete="off"
              // hint="Можна внести пізніше, коли надасть бухгалтерія"
              error={errors.invoiceNumber?.message}
              {...register('invoiceNumber')}
            />
            <TextField
              label="Дата розрахунку"
              type="date"
              max={kyivCalendarDate()}
              error={errors.invoiceDate?.message}
              aria-invalid={dateOff ? true : undefined}
              {...register('invoiceDate')}
            />
            <p
              role="status"
              aria-live="polite"
              className={clsx(styles.dateNote, note && styles[note.tone])}
            >
              {note?.text}
            </p>
          </div>
          {shown.map(workList)}
          <TextAreaField
            label="Коментар (необовʼязково)"
            rows={3}
            error={errors.comment?.message}
            {...register('comment')}
          />
        </div>
        <div className={styles.files}>
          <ScanPanel
            title="Підстава розрахунку"
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
