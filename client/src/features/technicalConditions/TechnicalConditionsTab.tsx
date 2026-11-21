import { type ApplicationDto, type TechnicalConditionsDto } from '@tu-registry/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { canDeleteDocument, canManageDocuments, canRestoreDocument } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import {
  CancelDocumentDialog,
  DocumentFrame,
  DocumentNotes,
  documentStyles as styles,
  ScanButton,
} from '@/features/documents';
import { TuPaymentFrame } from '@/features/tuPayments';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate, formatDateTime, shortName } from '@/shared/lib/format';
import {
  CONNECTION_POINT_LABELS,
  CONNECTION_TYPE_LABELS,
  GAS_PRESSURE_LABELS,
} from '@/shared/lib/labels';
import { openPdf } from '@/shared/lib/pdf';
import { notifyError, notifySuccess } from '@/shared/lib/notify';
import {
  Badge,
  CardFooter,
  DataList,
  DataRow,
  ConfirmDialog,
  IconButton,
  IconLink,
  LoadFailed,
  Spinner,
} from '@/shared/ui';
import { technicalConditionsApi } from './api';
import {
  useCancelTechnicalConditions,
  useDeleteTechnicalConditions,
  useRestoreTechnicalConditions,
  useTechnicalConditions,
} from './queries';
import { TechnicalConditionsDialog } from './TechnicalConditionsDialog';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'cancel'; tu: TechnicalConditionsDto }
  | { kind: 'delete'; tu: TechnicalConditionsDto };

const gasFlowText = (value: number) => `${String(value).replace('.', ',')} м³/год`;
const titleOf = (tu: TechnicalConditionsDto) =>
  `№ ${tu.tuNumber} від ${formatCalendarDate(tu.preparedDate)}`;

/** One set of technical conditions: its rows, as on the «ТУ» tab. */
function TechnicalConditionsView({ tu }: { tu: TechnicalConditionsDto }) {
  return (
    <DataList labels="fixed">
      <DataRow label="Тип приєднання">{CONNECTION_TYPE_LABELS[tu.connectionType]}</DataRow>
      <DataRow label="Технічні умови">{titleOf(tu)}</DataRow>
      <DataRow label="Замовник за ТУ">{tu.customer}</DataRow>
      <DataRow label="Адреса за ТУ">{tu.address}</DataRow>
      <DataRow label="Тиск">{GAS_PRESSURE_LABELS[tu.gasPressure]}</DataRow>
      <DataRow label="Точка приєднання">{CONNECTION_POINT_LABELS[tu.connectionPoint]}</DataRow>
      <DataRow label="Витрати газу">{gasFlowText(tu.gasFlow)}</DataRow>
      <DataRow label="Виконавець">
        <span title={tu.engineer.fullName}>{shortName(tu.engineer.fullName)}</span>
      </DataRow>
      <DataRow label="Фактична дата отримання ТУ">{formatDateTime(tu.createdAt)}</DataRow>
    </DataList>
  );
}

/**
 * The «ТУ» tab of the card: the valid set in full, cancelled ones folded below. ＋ adds a new
 * set only while there is no valid one (the server enforces it too).
 */
export function TechnicalConditionsTab({ app }: { app: ApplicationDto }) {
  const user = useCurrentUser();
  const list = useTechnicalConditions(app.id);
  const cancel = useCancelTechnicalConditions(app.id);
  const restore = useRestoreTechnicalConditions(app.id);
  const remove = useDeleteTechnicalConditions(app.id);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [shownId, setShownId] = useState<string | null>(null);
  const close = () => setDialog({ kind: 'none' });
  const manage = canManageDocuments(app, user);
  // For good, with the payment (agreed 2026-11-19): an admin only, valid or cancelled alike.
  const canDelete = canDeleteDocument(app, user);
  const deleteButton = (tu: TechnicalConditionsDto) => (
    <IconButton
      icon="trash"
      label="Видалити"
      tone="danger"
      onClick={() => setDialog({ kind: 'delete', tu })}
    />
  );

  const run = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action();
      if (done) notifySuccess(done);
    } catch (e) {
      notifyError(toApiError(e).message);
    }
  };
  const openScanOf = (tu: TechnicalConditionsDto, fileId?: string, name = tu.scan?.name ?? '') =>
    run(() => openPdf(() => technicalConditionsApi.scanFile(app.id, tu.id, fileId), name));

  if (list.isPending) return <Spinner label="Завантаження технічних умов…" />;
  if (list.isError) {
    return <LoadFailed error={list.error} onRetry={() => list.refetch()} />;
  }

  const tus = list.data;
  const valid = tus.find((tu) => !tu.cancellation);
  // The set paged to; the valid one (or the latest) until the user pages.
  const shown = tus.find((tu) => tu.id === shownId) ?? valid ?? tus.at(-1);
  const position = shown ? tus.indexOf(shown) : -1;
  // One valid set per application (the server enforces it): another is added once it is cancelled.
  const addButton = manage && !valid && (
    <IconButton icon="plus" label="Додати ТУ" onClick={() => setDialog({ kind: 'create' })} />
  );

  return (
    <>
      {shown ? (
        // The conditions and their payment side by side, each in a titled frame (2026-11-19);
        // with more than one set, ‹ › page through them in the order made (2026-11-20).
        <div className={clsx(styles.split, styles.splitFill)}>
          <DocumentFrame
            title="Технічні умови"
            label={`Технічні умови ${titleOf(shown)}`}
            cancelled={Boolean(shown.cancellation)}
            footer={
              <>
                {shown.scan && (
                  <ScanButton title={shown.scan.name} onClick={() => openScanOf(shown)} />
                )}
                <div className={styles.frameFooterEnd}>
                  {tus.length > 1 && (
                    <div className={styles.frameActions}>
                      <IconButton
                        icon="chevronLeft"
                        label="Попередні ТУ"
                        disabled={position === 0}
                        onClick={() => setShownId(tus[position - 1]!.id)}
                      />
                      <IconButton
                        icon="chevronRight"
                        label="Наступні ТУ"
                        disabled={position === tus.length - 1}
                        onClick={() => setShownId(tus[position + 1]!.id)}
                      />
                    </div>
                  )}
                  <div className={styles.frameActions}>
                    {addButton}
                    {manage && !shown.cancellation && (
                      <>
                        <IconLink
                          icon="pencil"
                          label="Редагувати"
                          to={`/applications/${app.id}/technical-conditions/${shown.id}/edit`}
                        />
                        <IconButton
                          icon="ban"
                          label="Скасувати"
                          tone="danger"
                          onClick={() => setDialog({ kind: 'cancel', tu: shown })}
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
                            `Технічні умови № ${shown.tuNumber} відновлено`,
                          )
                        }
                      />
                    )}
                    {canDelete && deleteButton(shown)}
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
            <TechnicalConditionsView tu={shown} />
            <DocumentNotes
              cancellation={shown.cancellation}
              previousScans={shown.previousScans}
              onOpenScan={(scan) => openScanOf(shown, scan.id, scan.name)}
            />
          </DocumentFrame>
          <TuPaymentFrame app={app} tu={shown} />
        </div>
      ) : (
        <>
          <p className={styles.muted}>Технічні умови ще не підготовлено.</p>
          <CardFooter actions={addButton} />
        </>
      )}

      {dialog.kind === 'create' && (
        <TechnicalConditionsDialog
          app={app}
          onClose={close}
          onSaved={(saved) => {
            notifySuccess(`Технічні умови № ${saved.tuNumber} додано`);
            close();
          }}
        />
      )}
      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          danger
          title={`Видалити технічні умови № ${dialog.tu.tuNumber}?`}
          confirmLabel="Видалити"
          loading={remove.isPending}
          onCancel={close}
          onConfirm={async () => {
            const { tu } = dialog;
            try {
              await remove.mutateAsync({ id: tu.id, version: tu.version });
              close();
              notifySuccess(`Технічні умови № ${tu.tuNumber} видалено`);
            } catch (e) {
              notifyError(toApiError(e).message);
            }
          }}
        >
          <p>
            Технічні умови
            {dialog.tu.payment && `, оплату за рахунком № ${dialog.tu.payment.invoiceNumber}`} і всі
            їхні скани буде видалено назавжди. Цю дію не можна скасувати.
          </p>
        </ConfirmDialog>
      )}
      {dialog.kind === 'cancel' && (
        <CancelDocumentDialog
          title={`Скасувати технічні умови № ${dialog.tu.tuNumber}?`}
          onClose={close}
          onConfirm={(reason) =>
            cancel.mutateAsync({
              id: dialog.tu.id,
              input: { reason, version: dialog.tu.version },
            })
          }
        />
      )}
    </>
  );
}
