import { type ApplicationDto, RESPONSE_DEADLINE_DAYS, type ResponseDto } from '@tu-registry/shared';
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
import { responsesApi } from './api';
import { DocumentsReceivedDialog } from './DocumentsReceivedDialog';
import { useCancelResponse, useResponses, useRestoreResponse } from './queries';
import { ResponseDialog } from './ResponseDialog';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; response: ResponseDto }
  | { kind: 'documents'; response: ResponseDto }
  | { kind: 'cancel'; response: ResponseDto };

/** «Відповіді» of the application card: responses in date order, added without leaving it. */
export function ResponsesSection({ app }: { app: ApplicationDto }) {
  const user = useCurrentUser();
  const responses = useResponses(app.id);
  const cancel = useCancelResponse(app.id);
  const restore = useRestoreResponse(app.id);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const close = () => setDialog({ kind: 'none' });
  const manage = canManageDocuments(app, user);

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
  const openScanOf = (response: ResponseDto, fileId?: string, name = response.scan?.name ?? '') =>
    run(() => openPdf(() => responsesApi.scanFile(app.id, response.id, fileId), name));

  return (
    <CardBlock
      title="Відповіді"
      meta={
        responses.data && responses.data.length > 0 ? (
          <span className={styles.muted}>({responses.data.length})</span>
        ) : undefined
      }
      actions={
        manage && (
          <IconButton
            icon="plus"
            label="Додати відповідь"
            onClick={() => setDialog({ kind: 'create' })}
          />
        )
      }
    >
      {notice && <Alert variant="success">{notice}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      {responses.isPending ? (
        <Spinner label="Завантаження відповідей…" />
      ) : responses.isError ? (
        <Alert variant="error">
          {toApiError(responses.error).message}{' '}
          <Button size="sm" onClick={() => responses.refetch()}>
            Повторити
          </Button>
        </Alert>
      ) : responses.data.length === 0 ? (
        <p className={styles.muted}>Відповідей на заяву не надавали.</p>
      ) : (
        <CardItems>
          {responses.data.map((response) => {
            const title = `№ ${response.outgoingNumber} від ${formatCalendarDate(response.responseDate)}`;
            const overdueBy = response.workingDays - RESPONSE_DEADLINE_DAYS;
            return (
              <CardItem
                key={response.id}
                label={`Відповідь ${title}`}
                cancelled={!!response.cancellation}
                actions={
                  <>
                    {response.scan && (
                      <IconButton
                        icon="eye"
                        label="Переглянути скан"
                        title={response.scan.name}
                        onClick={() => openScanOf(response)}
                      />
                    )}
                    {manage && !response.cancellation && (
                      <>
                        <IconButton
                          icon="pencil"
                          label="Редагувати"
                          onClick={() => setDialog({ kind: 'edit', response })}
                        />
                        <IconButton
                          icon="fileCheck"
                          label="Документи надійшли"
                          onClick={() => setDialog({ kind: 'documents', response })}
                        />
                        <IconButton
                          icon="ban"
                          label="Скасувати"
                          tone="danger"
                          onClick={() => setDialog({ kind: 'cancel', response })}
                        />
                      </>
                    )}
                    {response.cancellation && canRestoreDocument(app, user) && (
                      <IconButton
                        icon="restore"
                        label="Відновити"
                        loading={restore.isPending}
                        onClick={() =>
                          run(
                            () =>
                              restore.mutateAsync({ id: response.id, version: response.version }),
                            `Відповідь № ${response.outgoingNumber} відновлено`,
                          )
                        }
                      />
                    )}
                  </>
                }
              >
                <p className={clsx(styles.title, response.cancellation && styles.struck)}>
                  <span>Відповідь {title}</span>
                  {response.cancellation && <Badge tone="danger">Скасовано</Badge>}
                </p>
                <ul className={styles.facts}>
                  <li>Інженер: {response.engineer.fullName}</li>
                  <li>
                    {workingDaysLabel(response.workingDays)} з {RESPONSE_DEADLINE_DAYS}{' '}
                    {overdueBy > 0 && !response.cancellation && app.deadlinesTracked && (
                      <Badge tone="danger">строк перевищено на {workingDaysLabel(overdueBy)}</Badge>
                    )}
                  </li>
                  {response.documentsReceivedAt && (
                    <li>Документи надійшли {formatCalendarDate(response.documentsReceivedAt)}</li>
                  )}
                </ul>
                {response.cancellation && (
                  <p className={styles.muted}>
                    Скасовано {formatDateTime(response.cancellation.at)},{' '}
                    {response.cancellation.by.fullName}: {response.cancellation.reason}
                  </p>
                )}
                <PreviousScans
                  scans={response.previousScans}
                  onOpen={(scan) => openScanOf(response, scan.id, scan.name)}
                />
              </CardItem>
            );
          })}
        </CardItems>
      )}

      {(dialog.kind === 'create' || dialog.kind === 'edit') && (
        <ResponseDialog
          app={app}
          response={dialog.kind === 'edit' ? dialog.response : undefined}
          onClose={close}
          onSaved={(saved) => {
            setError(undefined);
            setNotice(
              dialog.kind === 'edit'
                ? `Відповідь № ${saved.outgoingNumber} збережено`
                : `Відповідь № ${saved.outgoingNumber} додано`,
            );
            close();
          }}
        />
      )}
      {dialog.kind === 'documents' && (
        <DocumentsReceivedDialog
          applicationId={app.id}
          response={dialog.response}
          onClose={close}
        />
      )}
      {dialog.kind === 'cancel' && (
        <CancelDocumentDialog
          title={`Скасувати відповідь № ${dialog.response.outgoingNumber}?`}
          onClose={close}
          onConfirm={(reason) =>
            cancel.mutateAsync({
              id: dialog.response.id,
              input: { reason, version: dialog.response.version },
            })
          }
        />
      )}
    </CardBlock>
  );
}
