import {
  type ApplicationDto,
  formatHryvnias,
  formatMonth,
  type TechnicalConditionsDto,
  type TuPaymentScanKind,
} from '@tu-registry/shared';
import { Fragment, type ReactNode, useState } from 'react';
import { canDeleteDocument, canManageDocuments } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import { DocumentFrame, documentStyles as styles } from '@/features/documents';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { notifyError, notifySuccess } from '@/shared/lib/notify';
import { downloadFile, openPdf } from '@/shared/lib/pdf';
import { Button, ConfirmDialog, DataList, DataRow, IconButton } from '@/shared/ui';
import frameStyles from './TuPaymentFrame.module.scss';
import { tuPaymentApi } from './api';
import { SCAN_FIELDS } from './scanFields';
import { useDeleteTuPayment } from './queries';
import { TuPaymentDialog } from './TuPaymentDialog';

const date = (value: string | null) => (value ? formatCalendarDate(value) : null);

type Props = {
  app: ApplicationDto;
  tu: TechnicalConditionsDto;
};

/**
 * «Оплата за технічні умови» next to the valid conditions (agreed 2026-11-19): the invoice,
 * the payment and the act. Entered and changed in one dialog; deleted by an admin only.
 */
export function TuPaymentFrame({ app, tu }: Props) {
  const user = useCurrentUser();
  const remove = useDeleteTuPayment(app.id, tu.id);
  const [dialog, setDialog] = useState<'none' | 'edit' | 'delete'>('none');
  const close = () => setDialog('none');
  const payment = tu.payment;
  const manage = canManageDocuments(app, user) && !tu.cancellation;

  const openScan = async (kind: TuPaymentScanKind, name: string) => {
    try {
      const load = () => tuPaymentApi.scanFile(app.id, tu.id, kind);
      // The Word document is downloaded; the scans open in a tab.
      await (kind === 'contractDocument' ? downloadFile(load, name) : openPdf(load, name));
    } catch (error) {
      notifyError(toApiError(error).message);
    }
  };
  const confirmDelete = async () => {
    if (!payment) return;
    try {
      await remove.mutateAsync(payment.version);
      close();
      notifySuccess(`Оплату за рахунком № ${payment.invoiceNumber} видалено`);
    } catch (error) {
      notifyError(toApiError(error).message);
    }
  };

  /** A file's icon beside the row it belongs to (icons only, agreed 2026-11-20). */
  const fileButton = (kind: TuPaymentScanKind, label: string) => {
    const file = payment?.[SCAN_FIELDS[kind]];
    return (
      file && (
        <IconButton
          icon={kind === 'contractDocument' ? 'download' : 'eye'}
          label={label}
          title={`${label}: ${file.name}`}
          onClick={() => openScan(kind, file.name)}
        />
      )
    );
  };
  const withFiles = (text: ReactNode, ...files: ReactNode[]) => (
    <span className={frameStyles.withFiles}>
      {text || '—'}
      <span className={frameStyles.files}>
        {files.map((file, index) => (
          <Fragment key={index}>{file}</Fragment>
        ))}
      </span>
    </span>
  );
  const hasContract =
    payment &&
    (payment.contractNumber !== null || payment.contractDocument || payment.contractScan);

  const footer = payment && (
    <>
      <div className={styles.frameActions}>
        {manage && (
          <IconButton icon="pencil" label="Редагувати оплату" onClick={() => setDialog('edit')} />
        )}
        {canDeleteDocument(app, user) && (
          <IconButton
            icon="trash"
            label="Видалити оплату"
            tone="danger"
            onClick={() => {
              setDialog('delete');
            }}
          />
        )}
      </div>
    </>
  );

  return (
    <DocumentFrame title="Оплата за технічні умови" footer={footer}>
      {payment ? (
        <DataList labels="fixed">
          <DataRow label="Рахунок">
            {withFiles(
              `№ ${payment.invoiceNumber} від ${formatCalendarDate(payment.invoiceDate)}`,
              fileButton('invoice', 'Переглянути скан рахунку'),
            )}
          </DataRow>
          {hasContract && (
            <DataRow label="Договір">
              {withFiles(
                payment.contractNumber !== null &&
                  payment.contractDate &&
                  `№ ${payment.contractNumber} від ${formatCalendarDate(payment.contractDate)}`,
                fileButton('contractDocument', 'Завантажити договір (DOCX)'),
                fileButton('contract', 'Переглянути скан договору'),
              )}
            </DataRow>
          )}
          <DataRow label="Сума">{formatHryvnias(payment.amount)}</DataRow>
          <DataRow label="Фактична оплата">
            {payment.paidAmount !== null ? formatHryvnias(payment.paidAmount) : null}
          </DataRow>
          <DataRow label="Дата оплати">
            {withFiles(date(payment.paidDate), fileButton('receipt', 'Переглянути скан квитанції'))}
          </DataRow>
          <DataRow label="Здача акта">
            {withFiles(
              payment.actTransferMonth && formatMonth(payment.actTransferMonth),
              fileButton('act', 'Переглянути скан акта'),
            )}
          </DataRow>
        </DataList>
      ) : (
        <div className={styles.frameEmpty}>
          {manage ? (
            <Button onClick={() => setDialog('edit')}>Додати рахунок</Button>
          ) : (
            <p className={styles.muted}>Рахунок ще не внесено.</p>
          )}
        </div>
      )}

      {dialog === 'edit' && (
        <TuPaymentDialog
          applicationId={app.id}
          tu={tu}
          onClose={close}
          onSaved={(saved) => {
            close();
            notifySuccess(`Рахунок № ${saved.invoiceNumber} збережено`);
          }}
        />
      )}
      {dialog === 'delete' && payment && (
        <ConfirmDialog
          open
          danger
          title="Видалити оплату?"
          confirmLabel="Видалити"
          loading={remove.isPending}
          onCancel={close}
          onConfirm={confirmDelete}
        >
          <p>
            Рахунок № {payment.invoiceNumber}, договір, дату оплати, місяць здачі акта та всі файли
            оплати буде видалено назавжди. Запис про видалення лишиться в журналі аудиту.
          </p>
        </ConfirmDialog>
      )}
    </DocumentFrame>
  );
}
