import {
  type ApplicationDto,
  formatHryvnias,
  type TechnicalConditionsDto,
} from '@tu-registry/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { canManageDocuments, canRestoreDocument } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import {
  CancelDocumentDialog,
  DocumentFrame,
  DocumentNotes,
  documentStyles as styles,
  OtherDocuments,
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
  CardItem,
  DataList,
  DataRow,
  IconButton,
  IconLink,
  LoadFailed,
  Spinner,
} from '@/shared/ui';
import { technicalConditionsApi } from './api';
import {
  useCancelTechnicalConditions,
  useRestoreTechnicalConditions,
  useTechnicalConditions,
} from './queries';
import { TechnicalConditionsDialog } from './TechnicalConditionsDialog';

type DialogState =
  { kind: 'none' } | { kind: 'create' } | { kind: 'cancel'; tu: TechnicalConditionsDto };

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
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
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
  const openScanOf = (tu: TechnicalConditionsDto, fileId?: string, name = tu.scan?.name ?? '') =>
    run(() => openPdf(() => technicalConditionsApi.scanFile(app.id, tu.id, fileId), name));

  if (list.isPending) return <Spinner label="Завантаження технічних умов…" />;
  if (list.isError) {
    return <LoadFailed error={list.error} onRetry={() => list.refetch()} />;
  }

  const valid = list.data.find((tu) => !tu.cancellation);
  const cancelled = list.data.filter((tu) => tu !== valid).reverse();

  return (
    <>
      {valid ? (
        // The conditions and their payment side by side, each in a titled frame (2026-11-19).
        <div className={styles.split}>
          <DocumentFrame
            title="Технічні умови"
            label={`Технічні умови ${titleOf(valid)}`}
            footer={
              <>
                {valid.scan && (
                  <ScanButton title={valid.scan.name} onClick={() => openScanOf(valid)} />
                )}
                {manage && (
                  <div className={styles.frameActions}>
                    <IconLink
                      icon="pencil"
                      label="Редагувати"
                      to={`/applications/${app.id}/technical-conditions/${valid.id}/edit`}
                    />
                    <IconButton
                      icon="ban"
                      label="Скасувати"
                      tone="danger"
                      onClick={() => setDialog({ kind: 'cancel', tu: valid })}
                    />
                  </div>
                )}
              </>
            }
          >
            <TechnicalConditionsView tu={valid} />
            <DocumentNotes
              cancellation={null}
              previousScans={valid.previousScans}
              onOpenScan={(scan) => openScanOf(valid, scan.id, scan.name)}
            />
          </DocumentFrame>
          <TuPaymentFrame app={app} tu={valid} />
        </div>
      ) : (
        <p className={styles.muted}>
          {list.data.length === 0
            ? 'Технічні умови ще не підготовлено.'
            : 'Чинних технічних умов немає: усі скасовано.'}
        </p>
      )}

      <OtherDocuments title="Скасовані технічні умови" count={cancelled.length}>
        {cancelled.map((tu) => (
          <CardItem
            key={tu.id}
            label={`Технічні умови ${titleOf(tu)}`}
            cancelled
            actions={
              <>
                {tu.scan && (
                  <IconButton
                    icon="eye"
                    label="Переглянути скан"
                    title={tu.scan.name}
                    onClick={() => openScanOf(tu)}
                  />
                )}
                {canRestoreDocument(app, user) && (
                  <IconButton
                    icon="restore"
                    label="Відновити"
                    loading={restore.isPending}
                    onClick={() =>
                      run(
                        () => restore.mutateAsync({ id: tu.id, version: tu.version }),
                        `Технічні умови № ${tu.tuNumber} відновлено`,
                      )
                    }
                  />
                )}
              </>
            }
          >
            <p className={clsx(styles.title, styles.struck)}>
              <span>Технічні умови {titleOf(tu)}</span>
              <Badge tone="danger">Скасовано</Badge>
            </p>
            <TechnicalConditionsView tu={tu} />
            {tu.payment && (
              <p className={styles.muted}>
                Оплата: рахунок № {tu.payment.invoiceNumber} від{' '}
                {formatCalendarDate(tu.payment.invoiceDate)}, {formatHryvnias(tu.payment.amount)}
                {tu.payment.paidDate && `, сплачено ${formatCalendarDate(tu.payment.paidDate)}`}
              </p>
            )}
            <DocumentNotes
              cancellation={tu.cancellation}
              previousScans={tu.previousScans}
              onOpenScan={(scan) => openScanOf(tu, scan.id, scan.name)}
            />
          </CardItem>
        ))}
      </OtherDocuments>

      {!valid && (
        <CardFooter
          actions={
            manage && (
              <IconButton
                icon="plus"
                label="Додати ТУ"
                onClick={() => setDialog({ kind: 'create' })}
              />
            )
          }
        />
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
