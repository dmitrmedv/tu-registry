import {
  type ApplicationDto,
  formatFileSize,
  RESPONSE_DEADLINE_DAYS,
  type ResponseDto,
} from '@tu-registry/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { canManageDocuments, canRestoreDocument } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate, formatDateTime, workingDaysLabel } from '@/shared/lib/format';
import { openPdf } from '@/shared/lib/pdf';
import { Alert, Badge, Button, Icon, Spinner } from '@/shared/ui';
import { responsesApi } from './api';
import { CancelDocumentDialog } from './CancelDocumentDialog';
import { DocumentsReceivedDialog } from './DocumentsReceivedDialog';
import { useCancelResponse, useResponses, useRestoreResponse } from './queries';
import { ResponseDialog } from './ResponseDialog';
import styles from './responses.module.scss';

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
    <section className={styles.section} aria-labelledby="responses-title">
      <div className={styles.header}>
        <h2 id="responses-title">Відповіді</h2>
        {manage && <Button onClick={() => setDialog({ kind: 'create' })}>Додати відповідь</Button>}
      </div>

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
        <ol className={styles.list}>
          {responses.data.map((response) => {
            const title = `№ ${response.outgoingNumber} від ${formatCalendarDate(response.responseDate)}`;
            const overdueBy = response.workingDays - RESPONSE_DEADLINE_DAYS;
            return (
              <li
                key={response.id}
                className={clsx(styles.item, response.cancellation && styles.cancelled)}
                aria-label={`Відповідь ${title}`}
              >
                <p className={styles.title}>
                  <span>Відповідь {title}</span>
                  {response.cancellation && <Badge tone="danger">Скасовано</Badge>}
                </p>
                <ul className={styles.facts}>
                  <li>Інженер: {response.engineer.fullName}</li>
                  <li>
                    {workingDaysLabel(response.workingDays)} з {RESPONSE_DEADLINE_DAYS}{' '}
                    {overdueBy > 0 && !response.cancellation && (
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
                <div className={styles.actions}>
                  {response.scan && (
                    <Button
                      size="sm"
                      title={response.scan.name}
                      onClick={() => openScanOf(response)}
                    >
                      <Icon name="eye" />
                      Переглянути скан
                    </Button>
                  )}
                  {manage && !response.cancellation && (
                    <>
                      <Button size="sm" onClick={() => setDialog({ kind: 'edit', response })}>
                        <Icon name="pencil" />
                        Редагувати
                      </Button>
                      <Button size="sm" onClick={() => setDialog({ kind: 'documents', response })}>
                        Документи надійшли
                      </Button>
                      <Button size="sm" onClick={() => setDialog({ kind: 'cancel', response })}>
                        <Icon name="ban" />
                        Скасувати
                      </Button>
                    </>
                  )}
                  {response.cancellation && canRestoreDocument(app, user) && (
                    <Button
                      size="sm"
                      loading={restore.isPending}
                      onClick={() =>
                        run(
                          () => restore.mutateAsync({ id: response.id, version: response.version }),
                          `Відповідь № ${response.outgoingNumber} відновлено`,
                        )
                      }
                    >
                      <Icon name="restore" />
                      Відновити
                    </Button>
                  )}
                </div>
                {response.previousScans.length > 0 && (
                  <details className={styles.previous}>
                    <summary>Попередні версії скану ({response.previousScans.length})</summary>
                    <ul>
                      {response.previousScans.map((scan) => (
                        <li key={scan.id}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openScanOf(response, scan.id, scan.name)}
                          >
                            {scan.name}
                          </Button>{' '}
                          <span className={styles.muted}>
                            {formatFileSize(scan.size)}, {formatDateTime(scan.uploadedAt)},{' '}
                            {scan.uploadedBy.fullName}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
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
    </section>
  );
}
