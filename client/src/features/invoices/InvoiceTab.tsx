import {
  type ApplicationDto,
  formatHryvnias,
  type InvoiceDto,
  type InvoiceFileKind,
  invoiceNumberText,
} from '@tu-registry/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { canDeleteDocument, canManageDocuments, canRestoreDocument } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import { useContracts } from '@/features/contracts/queries';
import {
  CancelDocumentDialog,
  CancellationNote,
  documentStyles as styles,
} from '@/features/documents';
import { toApiError } from '@/shared/api/apiError';
import { formatDateTime } from '@/shared/lib/format';
import { notifyError, notifySuccess } from '@/shared/lib/notify';
import { downloadFile, openPdf } from '@/shared/lib/pdf';
import {
  Badge,
  CardFooter,
  ConfirmDialog,
  DataList,
  DataRow,
  IconButton,
  LoadFailed,
  MenuButton,
  Spinner,
} from '@/shared/ui';
import { invoicesApi } from './api';
import { InvoiceDialog } from './InvoiceDialog';
import { contractInForce, invoiceDocument, invoiceSections, invoiceTitle } from './invoiceSections';
import tabStyles from './InvoiceTab.module.scss';
import { useCancelInvoice, useDeleteInvoice, useInvoices, useRestoreInvoice } from './queries';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; invoice: InvoiceDto }
  | { kind: 'cancel'; invoice: InvoiceDto }
  | { kind: 'delete'; invoice: InvoiceDto };

const titleOf = invoiceTitle;

/**
 * One calculation (mock-up of 2026-11-22): on the left its data and the comment, on the right
 * its works by section with their sums and the total; one column where the card is narrow.
 */
function InvoiceView({ invoice }: { invoice: InvoiceDto }) {
  return (
    <div className={tabStyles.view}>
      <div className={tabStyles.columns}>
        <div>
          <DataList labels="fixed">
            <DataRow label="Розрахунок">{titleOf(invoice)}</DataRow>
            <DataRow label="Додаткова угода">
              {invoice.agreementNumber === null ? '—' : `№ ${invoice.agreementNumber}`}
            </DataRow>
            <DataRow label="Від узгодження проєкту">
              {invoice.workingDays} роб. дн.
              {invoice.overdueBy > 0 && (
                <>
                  {' '}
                  <Badge tone="danger">прострочено на {invoice.overdueBy} роб. дн.</Badge>
                </>
              )}
            </DataRow>
            <DataRow label="Внесено">{formatDateTime(invoice.createdAt)}</DataRow>
          </DataList>
          {invoice.comment && (
            <section className={tabStyles.comment} aria-label="Коментар">
              <h4 className={tabStyles.commentTitle}>Коментар</h4>
              <p className={tabStyles.commentText}>{invoice.comment}</p>
            </section>
          )}
        </div>
        <div className={tabStyles.sections}>
          {invoiceSections(invoice).map(({ label, sum, works }) => {
            return (
              <section key={label} aria-label={label}>
                <h4 className={tabStyles.groupTitle}>
                  <span>{label}</span>
                  <span>{formatHryvnias(sum)}</span>
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
            <span>Всього:</span>
            <span>{formatHryvnias(invoice.totals.total)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The «Розрахунок» tab of the card: one invoice at a time, ‹ › page through all of them in the
 * order made (one per stage of construction). ＋ adds another at any time; the server asks for
 * a valid project.
 */
export function InvoiceTab({ app }: { app: ApplicationDto }) {
  const user = useCurrentUser();
  const list = useInvoices(app.id);
  const contracts = useContracts(app.id);
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
        invoice[kind]?.name ?? 'розрахунок.pdf',
      ),
    );

  // The libraries only when asked for: they are large (2026-11-23).
  const documentOf = (invoice: InvoiceDto) =>
    invoiceDocument(invoice, app, contractInForce(contracts.data ?? []));
  const downloadExcel = (invoice: InvoiceDto) =>
    run(async () => {
      const doc = documentOf(invoice);
      const excel = await import('./invoiceExcel');
      await downloadFile(() => excel.invoiceWorkbook(doc), `${doc.fileName}.xlsx`);
    });
  // The tab opens within the click (see openPdf), the PDF follows.
  const openInvoicePdf = (invoice: InvoiceDto) => {
    const doc = documentOf(invoice);
    return run(() =>
      openPdf(async () => (await import('./invoicePdf')).invoicePdf(doc), `${doc.fileName}.pdf`),
    );
  };

  if (list.isPending) return <Spinner label="Завантаження розрахунків…" />;
  if (list.isError) return <LoadFailed error={list.error} onRetry={() => list.refetch()} />;

  const invoices = list.data;
  // The invoice paged to; the latest valid one (or the latest) until the user pages.
  const shown =
    invoices.find((invoice) => invoice.id === shownId) ??
    invoices.findLast((invoice) => !invoice.cancellation) ??
    invoices.at(-1);
  const position = shown ? invoices.indexOf(shown) : -1;
  const addButton = manage && (
    <IconButton
      icon="plus"
      label="Додати розрахунок"
      onClick={() => setDialog({ kind: 'create' })}
    />
  );

  return (
    <>
      {shown ? (
        // Straight on the tab, with no frame of its own (mock-up of 2026-11-22).
        <section
          aria-label={`Розрахунок ${titleOf(shown)}`}
          className={clsx(tabStyles.document, shown.cancellation && tabStyles.cancelled)}
        >
          {shown.cancellation && (
            <span className={tabStyles.badge}>
              <Badge tone="danger">Скасовано</Badge>
            </span>
          )}
          <InvoiceView invoice={shown} />
          {shown.cancellation && <CancellationNote cancellation={shown.cancellation} />}
          <div className={clsx(styles.frameFooter, tabStyles.footer)}>
            <div className={styles.frameActions}>
              {shown.basis && (
                <IconButton
                  icon="eye"
                  label="Відкрити підставу розрахунку"
                  title={shown.basis.name}
                  onClick={() => openFile(shown, 'basis')}
                />
              )}
              <MenuButton
                icon="download"
                label="Завантажити розрахунок"
                align="start"
                items={[
                  { label: '.xlsx', onSelect: () => downloadExcel(shown) },
                  { label: 'PDF', onSelect: () => openInvoicePdf(shown) },
                ]}
              />
            </div>
            <div className={styles.frameFooterEnd}>
              {invoices.length > 1 && (
                <div className={styles.frameActions}>
                  <span className={tabStyles.position}>
                    {position + 1} з {invoices.length}
                  </span>
                  <IconButton
                    icon="chevronLeft"
                    label="Попередній розрахунок"
                    disabled={position === 0}
                    onClick={() => setShownId(invoices[position - 1]!.id)}
                  />
                  <IconButton
                    icon="chevronRight"
                    label="Наступний розрахунок"
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
                        `Розрахунок ${invoiceNumberText(shown.invoiceNumber)} відновлено`,
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
          </div>
        </section>
      ) : (
        <>
          <p className={styles.muted}>Розрахунків ще немає.</p>
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
              `Розрахунок ${invoiceNumberText(saved.invoiceNumber)} ${dialog.kind === 'edit' ? 'збережено' : 'додано'}`,
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
          title={`Видалити розрахунок ${invoiceNumberText(dialog.invoice.invoiceNumber)}?`}
          confirmLabel="Видалити"
          loading={remove.isPending}
          onCancel={close}
          onConfirm={async () => {
            const { invoice } = dialog;
            try {
              await remove.mutateAsync({ id: invoice.id, version: invoice.version });
              close();
              setShownId(null);
              notifySuccess(`Розрахунок ${invoiceNumberText(invoice.invoiceNumber)} видалено`);
            } catch (e) {
              notifyError(toApiError(e).message);
            }
          }}
        >
          <p>Розрахунок і його файли буде видалено назавжди. Цю дію не можна скасувати.</p>
        </ConfirmDialog>
      )}
      {dialog.kind === 'cancel' && (
        <CancelDocumentDialog
          title={`Скасувати розрахунок ${invoiceNumberText(dialog.invoice.invoiceNumber)}?`}
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
