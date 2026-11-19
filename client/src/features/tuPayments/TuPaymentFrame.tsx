import {
  type ApplicationDto,
  formatHryvnias,
  formatMonth,
  type TechnicalConditionsDto,
  type TuPaymentScanKind,
} from '@tu-registry/shared';
import { useState } from 'react';
import { canDeleteDocument, canManageDocuments } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import { DocumentFrame, documentStyles as styles } from '@/features/documents';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { notifySuccess } from '@/shared/lib/notify';
import { openPdf } from '@/shared/lib/pdf';
import { Button, ConfirmDialog, DataList, DataRow, Icon, IconButton } from '@/shared/ui';
import { tuPaymentApi } from './api';
import { useDeleteTuPayment } from './queries';
import { TuPaymentDialog } from './TuPaymentDialog';

const date = (value: string | null) => (value ? formatCalendarDate(value) : null);

type Props = {
  app: ApplicationDto;
  tu: TechnicalConditionsDto;
  /** Problems opening a scan: shown by the tab, above its frames. */
  onError: (message: string) => void;
};

/**
 * «Оплата за технічні умови» next to the valid conditions (agreed 2026-11-19): the invoice,
 * the payment and the act. Entered and changed in one dialog; deleted by an admin only.
 */
export function TuPaymentFrame({ app, tu, onError }: Props) {
  const user = useCurrentUser();
  const remove = useDeleteTuPayment(app.id, tu.id);
  const [dialog, setDialog] = useState<'none' | 'edit' | 'delete'>('none');
  const [deleteError, setDeleteError] = useState<string>();
  const close = () => setDialog('none');
  const payment = tu.payment;
  const manage = canManageDocuments(app, user) && !tu.cancellation;

  const openScan = async (kind: TuPaymentScanKind, name: string) => {
    try {
      await openPdf(() => tuPaymentApi.scanFile(app.id, tu.id, kind), name);
    } catch (error) {
      onError(toApiError(error).message);
    }
  };
  const confirmDelete = async () => {
    if (!payment) return;
    setDeleteError(undefined);
    try {
      await remove.mutateAsync(payment.version);
      close();
      notifySuccess(`Оплату за рахунком № ${payment.invoiceNumber} видалено`);
    } catch (error) {
      setDeleteError(toApiError(error).message);
    }
  };

  const footer = payment && (
    <>
      <div className={styles.frameScans}>
        {payment.receiptScan && (
          <Button
            title={payment.receiptScan.name}
            onClick={() => openScan('receipt', payment.receiptScan!.name)}
          >
            Квитанція <Icon name="eye" />
          </Button>
        )}
        {payment.actScan && (
          <Button
            title={payment.actScan.name}
            onClick={() => openScan('act', payment.actScan!.name)}
          >
            Акт <Icon name="eye" />
          </Button>
        )}
      </div>
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
              setDeleteError(undefined);
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
            № {payment.invoiceNumber} від {formatCalendarDate(payment.invoiceDate)}
          </DataRow>
          <DataRow label="Сума">{formatHryvnias(payment.amount)}</DataRow>
          <DataRow label="Дата оплати">{date(payment.paidDate)}</DataRow>
          <DataRow label="Місяць передачі акта">
            {payment.actTransferMonth && formatMonth(payment.actTransferMonth)}
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
          error={deleteError}
          onCancel={close}
          onConfirm={confirmDelete}
        >
          <p>
            Рахунок № {payment.invoiceNumber}, дату оплати, місяць передачі акта та скани квитанції
            й акта буде видалено назавжди. Запис про видалення лишиться в журналі аудиту.
          </p>
        </ConfirmDialog>
      )}
    </DocumentFrame>
  );
}
