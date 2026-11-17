import {
  type ApplicationDto,
  type TechnicalConditionsDto,
  TU_DEADLINE_DAYS,
} from '@tu-registry/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { canManageDocuments, canRestoreDocument } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import {
  CancelDocumentDialog,
  documentStyles as styles,
  PreviousScans,
} from '@/features/documents';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate, formatDateTime, workingDaysLabel } from '@/shared/lib/format';
import {
  CONNECTION_POINT_LABELS,
  CONNECTION_TYPE_LABELS,
  GAS_PRESSURE_LABELS,
} from '@/shared/lib/labels';
import { openPdf } from '@/shared/lib/pdf';
import {
  Alert,
  Badge,
  Button,
  CardBlock,
  CardItem,
  CardItems,
  IconButton,
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
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; tu: TechnicalConditionsDto }
  | { kind: 'cancel'; tu: TechnicalConditionsDto };

const gasFlowText = (value: number) => `${String(value).replace('.', ',')} м³/год`;

/**
 * «Технічні умови» of the application card: the valid set in full, cancelled ones below.
 * A new set can be added only while there is no valid one (the server enforces it too).
 */
export function TechnicalConditionsSection({ app }: { app: ApplicationDto }) {
  const user = useCurrentUser();
  const list = useTechnicalConditions(app.id);
  const cancel = useCancelTechnicalConditions(app.id);
  const restore = useRestoreTechnicalConditions(app.id);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const close = () => setDialog({ kind: 'none' });
  const manage = canManageDocuments(app, user);
  const valid = list.data?.find((tu) => !tu.cancellation);

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
      if (done) setNotice(done);
    } catch (e) {
      setError(toApiError(e).message);
    }
  };
  const openScanOf = (tu: TechnicalConditionsDto, fileId?: string, name = tu.scan?.name ?? '') =>
    run(() => openPdf(() => technicalConditionsApi.scanFile(app.id, tu.id, fileId), name));

  return (
    <CardBlock
      title="Технічні умови"
      actions={
        manage &&
        list.isSuccess &&
        !valid && (
          <IconButton icon="plus" label="Додати ТУ" onClick={() => setDialog({ kind: 'create' })} />
        )
      }
    >
      {notice && <Alert variant="success">{notice}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      {list.isPending ? (
        <Spinner label="Завантаження технічних умов…" />
      ) : list.isError ? (
        <Alert variant="error">
          {toApiError(list.error).message}{' '}
          <Button size="sm" onClick={() => list.refetch()}>
            Повторити
          </Button>
        </Alert>
      ) : list.data.length === 0 ? (
        <p className={styles.muted}>Технічні умови ще не підготовлено.</p>
      ) : (
        <CardItems>
          {/* The valid set first, then the cancelled ones in the order prepared. */}
          {[...(valid ? [valid] : []), ...list.data.filter((tu) => tu !== valid)].map((tu) => {
            const title = `№ ${tu.tuNumber} від ${formatCalendarDate(tu.preparedDate)}`;
            const overdueBy = tu.workingDays - TU_DEADLINE_DAYS;
            return (
              <CardItem
                key={tu.id}
                label={`Технічні умови ${title}`}
                cancelled={!!tu.cancellation}
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
                    {manage && !tu.cancellation && (
                      <>
                        <IconButton
                          icon="pencil"
                          label="Редагувати"
                          onClick={() => setDialog({ kind: 'edit', tu })}
                        />
                        <IconButton
                          icon="ban"
                          label="Скасувати"
                          tone="danger"
                          onClick={() => setDialog({ kind: 'cancel', tu })}
                        />
                      </>
                    )}
                    {tu.cancellation && canRestoreDocument(app, user) && (
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
                <p className={clsx(styles.title, tu.cancellation && styles.struck)}>
                  <span>Технічні умови {title}</span>
                  {tu.cancellation && <Badge tone="danger">Скасовано</Badge>}
                </p>
                <dl className={styles.fields}>
                  <div>
                    <dt>Інженер</dt>
                    <dd>{tu.engineer.fullName}</dd>
                  </div>
                  <div>
                    <dt>Строк</dt>
                    <dd>
                      {workingDaysLabel(tu.workingDays)} з {TU_DEADLINE_DAYS}{' '}
                      {overdueBy > 0 && !tu.cancellation && app.deadlinesTracked && (
                        <Badge tone="danger">
                          строк перевищено на {workingDaysLabel(overdueBy)}
                        </Badge>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Витрати газу</dt>
                    <dd>{gasFlowText(tu.gasFlow)}</dd>
                  </div>
                  <div>
                    <dt>Тип приєднання</dt>
                    <dd>{CONNECTION_TYPE_LABELS[tu.connectionType]}</dd>
                  </div>
                  <div>
                    <dt>Тиск газу</dt>
                    <dd>{GAS_PRESSURE_LABELS[tu.gasPressure]}</dd>
                  </div>
                  <div>
                    <dt>Точка приєднання</dt>
                    <dd>{CONNECTION_POINT_LABELS[tu.connectionPoint]}</dd>
                  </div>
                </dl>
                {tu.cancellation && (
                  <p className={styles.muted}>
                    Скасовано {formatDateTime(tu.cancellation.at)}, {tu.cancellation.by.fullName}:{' '}
                    {tu.cancellation.reason}
                  </p>
                )}
                <PreviousScans
                  scans={tu.previousScans}
                  onOpen={(scan) => openScanOf(tu, scan.id, scan.name)}
                />
              </CardItem>
            );
          })}
        </CardItems>
      )}

      {(dialog.kind === 'create' || dialog.kind === 'edit') && (
        <TechnicalConditionsDialog
          app={app}
          technicalConditions={dialog.kind === 'edit' ? dialog.tu : undefined}
          onClose={close}
          onSaved={(saved) => {
            setError(undefined);
            setNotice(
              dialog.kind === 'edit'
                ? `Технічні умови № ${saved.tuNumber} збережено`
                : `Технічні умови № ${saved.tuNumber} додано`,
            );
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
    </CardBlock>
  );
}
