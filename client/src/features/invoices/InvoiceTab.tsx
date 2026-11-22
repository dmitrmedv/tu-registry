import {
  type ApplicationDto,
  formatHryvnias,
  INVOICE_DEADLINE_DAYS,
  INVOICE_WORK_GROUPS,
  type InvoiceDto,
  type InvoiceFileKind,
  invoiceNumberText,
} from '@tu-registry/shared';
import { useState } from 'react';
import { canDeleteDocument, canManageDocuments, canRestoreDocument } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import {
  CancelDocumentDialog,
  CancellationNote,
  DocumentFrame,
  documentStyles as styles,
} from '@/features/documents';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate, formatDateTime } from '@/shared/lib/format';
import { INVOICE_WORK_GROUP_LABELS } from '@/shared/lib/labels';
import { notifyError, notifySuccess } from '@/shared/lib/notify';
import { openPdf } from '@/shared/lib/pdf';
import {
  Badge,
  CardFooter,
  ConfirmDialog,
  DataList,
  DataRow,
  IconButton,
  LoadFailed,
  Spinner,
} from '@/shared/ui';
import { invoicesApi } from './api';
import { InvoiceDialog } from './InvoiceDialog';
import tabStyles from './InvoiceTab.module.scss';
import { useCancelInvoice, useDeleteInvoice, useInvoices, useRestoreInvoice } from './queries';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; invoice: InvoiceDto }
  | { kind: 'cancel'; invoice: InvoiceDto }
  | { kind: 'delete'; invoice: InvoiceDto };

const titleOf = (invoice: InvoiceDto) =>
  `${invoiceNumberText(invoice.invoiceNumber)} від ${formatCalendarDate(invoice.invoiceDate)}`;

/** One invoice: its works by group with their sums, the total and its term. */
function InvoiceView({ invoice }: { invoice: InvoiceDto }) {
  return (
    <>
      <DataList labels="fixed">
        <DataRow label="Рахунок">{titleOf(invoice)}</DataRow>
        <DataRow label="Додаткова угода">
          {invoice.agreementNumber === null ? '—' : `№ ${invoice.agreementNumber}`}
        </DataRow>
        <DataRow label="Від узгодження проєкту">
          {invoice.workingDays} роб. дн. (строк — {INVOICE_DEADLINE_DAYS})
          {invoice.overdueBy > 0 && (
            <>
              {' '}
              <Badge tone="danger">прострочено на {invoice.overdueBy} роб. дн.</Badge>
            </>
          )}
        </DataRow>
        <DataRow label="Внесено">{formatDateTime(invoice.createdAt)}</DataRow>
        {invoice.comment && <DataRow label="Коментар">{invoice.comment}</DataRow>}
      </DataList>
      {INVOICE_WORK_GROUPS.map((group) => {
        const works = invoice.works.filter((work) => work.group === group);
        // Geodesy only where it was entered: most connections have none.
        // The permits only where they were entered: most connections have none.
        if (group === 'EARTHWORKS' && works.length === 0) return null;
        return (
          <section key={group} aria-label={INVOICE_WORK_GROUP_LABELS[group]}>
            <h4 className={tabStyles.groupTitle}>
              <span>{INVOICE_WORK_GROUP_LABELS[group]}</span>
              <span>{formatHryvnias(invoice.totals[group])}</span>
            </h4>
            {works.length > 0 && (
              <ul className={tabStyles.works}>
                {works.map((work, index) => (
                  <li key={index}>
                    <span>{work.name}</span>
                    <span>{formatHryvnias(work.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <p className={tabStyles.total}>
        <span>Загальна вартість приєднання</span>
        <span>{formatHryvnias(invoice.totals.total)}</span>
      </p>
    </>
  );
}

/**
 * The «Рахунок» tab of the card: one invoice at a time, ‹ › page through all of them in the
 * order made (one per stage of construction). ＋ adds another at any time; the server asks for
 * a valid project.
 */
export function InvoiceTab({ app }: { app: ApplicationDto }) {
  const user = useCurrentUser();
  const list = useInvoices(app.id);
  const cancel = useCancelInvoice(app.id);
  const restore = useRestoreInvoice(app.id);
  const remove = useDeleteInvoice(app.id);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [shownId, setShownId] = useState<string | null>(null);
  const close = () => setDialog({ kind: 'none' });
  const manage = canManageDocuments(app, user);

  const run = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action();
      if (done) notifySuccess(done);
    } catch (e) {
      notifyError(toApiError(e).message);
    }
  };
  const openFile = (invoice: InvoiceDto, kind: InvoiceFileKind) =>
    run(() =>
      openPdf(
        () => invoicesApi.file(app.id, invoice.id, kind),
        invoice[kind]?.name ?? 'рахунок.pdf',
      ),
    );

  if (list.isPending) return <Spinner label="Завантаження рахунків…" />;
  if (list.isError) return <LoadFailed error={list.error} onRetry={() => list.refetch()} />;

  const invoices = list.data;
  // The invoice paged to; the latest valid one (or the latest) until the user pages.
  const shown =
    invoices.find((invoice) => invoice.id === shownId) ??
    invoices.findLast((invoice) => !invoice.cancellation) ??
    invoices.at(-1);
  const position = shown ? invoices.indexOf(shown) : -1;
  const addButton = manage && (
    <IconButton icon="plus" label="Додати рахунок" onClick={() => setDialog({ kind: 'create' })} />
  );

  return (
    <>
      {shown ? (
        <DocumentFrame
          title={invoices.length > 1 ? `Рахунок ${position + 1} з ${invoices.length}` : 'Рахунок'}
          label={`Рахунок ${titleOf(shown)}`}
          cancelled={Boolean(shown.cancellation)}
          footer={
            <>
              <div className={styles.frameActions}>
                {shown.scan && (
                  <IconButton
                    icon="eye"
                    label="Відкрити скан рахунку"
                    title={shown.scan.name}
                    onClick={() => openFile(shown, 'scan')}
                  />
                )}
                {shown.basis && (
                  <IconButton
                    icon="eye"
                    label="Відкрити підставу рахунку"
                    title={shown.basis.name}
                    onClick={() => openFile(shown, 'basis')}
                  />
                )}
              </div>
              <div className={styles.frameFooterEnd}>
                {invoices.length > 1 && (
                  <div className={styles.frameActions}>
                    <IconButton
                      icon="chevronLeft"
                      label="Попередній рахунок"
                      disabled={position === 0}
                      onClick={() => setShownId(invoices[position - 1]!.id)}
                    />
                    <IconButton
                      icon="chevronRight"
                      label="Наступний рахунок"
                      disabled={position === invoices.length - 1}
                      onClick={() => setShownId(invoices[position + 1]!.id)}
                    />
                  </div>
                )}
                <div className={styles.frameActions}>
                  {addButton}
                  {manage && !shown.cancellation && (
                    <>
                      <IconButton
                        icon="pencil"
                        label="Редагувати"
                        onClick={() => setDialog({ kind: 'edit', invoice: shown })}
                      />
                      <IconButton
                        icon="ban"
                        label="Скасувати"
                        tone="danger"
                        onClick={() => setDialog({ kind: 'cancel', invoice: shown })}
                      />
                    </>
                  )}
                  {shown.cancellation && canRestoreDocument(app, user) && (
                    <IconButton
                      icon="restore"
                      label="Відновити"
                      loading={restore.isPending}
                      onClick={() =>
                        run(
                          () => restore.mutateAsync({ id: shown.id, version: shown.version }),
                          `Рахунок ${invoiceNumberText(shown.invoiceNumber)} відновлено`,
                        )
                      }
                    />
                  )}
                  {canDeleteDocument(app, user) && (
                    <IconButton
                      icon="trash"
                      label="Видалити"
                      tone="danger"
                      onClick={() => setDialog({ kind: 'delete', invoice: shown })}
                    />
                  )}
                </div>
              </div>
            </>
          }
        >
          {shown.cancellation && (
            <span className={styles.frameBadge}>
              <Badge tone="danger">Скасовано</Badge>
            </span>
          )}
          <InvoiceView invoice={shown} />
          {shown.cancellation && <CancellationNote cancellation={shown.cancellation} />}
        </DocumentFrame>
      ) : (
        <>
          <p className={styles.muted}>Рахунків ще немає.</p>
          <CardFooter actions={addButton} />
        </>
      )}

      {(dialog.kind === 'create' || dialog.kind === 'edit') && (
        <InvoiceDialog
          app={app}
          invoice={dialog.kind === 'edit' ? dialog.invoice : undefined}
          onClose={close}
          onSaved={(saved) => {
            notifySuccess(
              `Рахунок ${invoiceNumberText(saved.invoiceNumber)} ${dialog.kind === 'edit' ? 'збережено' : 'додано'}`,
            );
            setShownId(saved.id);
            close();
          }}
        />
      )}
      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          danger
          title={`Видалити рахунок ${invoiceNumberText(dialog.invoice.invoiceNumber)}?`}
          confirmLabel="Видалити"
          loading={remove.isPending}
          onCancel={close}
          onConfirm={async () => {
            const { invoice } = dialog;
            try {
              await remove.mutateAsync({ id: invoice.id, version: invoice.version });
              close();
              setShownId(null);
              notifySuccess(`Рахунок ${invoiceNumberText(invoice.invoiceNumber)} видалено`);
            } catch (e) {
              notifyError(toApiError(e).message);
            }
          }}
        >
          <p>Рахунок і його файли буде видалено назавжди. Цю дію не можна скасувати.</p>
        </ConfirmDialog>
      )}
      {dialog.kind === 'cancel' && (
        <CancelDocumentDialog
          title={`Скасувати рахунок ${invoiceNumberText(dialog.invoice.invoiceNumber)}?`}
          onClose={close}
          onConfirm={(reason) =>
            cancel.mutateAsync({
              id: dialog.invoice.id,
              input: { reason, version: dialog.invoice.version },
            })
          }
        />
      )}
    </>
  );
}
