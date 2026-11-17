import type { ApplicationDto, ResponseDto } from '@tu-registry/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { canDeleteDocument, canManageDocuments, canRestoreDocument } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import {
  CancelDocumentDialog,
  CancellationNote,
  documentStyles as styles,
  PreviousScans,
} from '@/features/documents';
import { toApiError } from '@/shared/api/apiError';
import { openPdf } from '@/shared/lib/pdf';
import { notifySuccess } from '@/shared/lib/notify';
import { Alert, Badge, Button, CardFooter, ConfirmDialog, IconButton, Spinner } from '@/shared/ui';
import { responsesApi } from './api';
import { useCancelResponse, useDeleteResponse, useResponses, useRestoreResponse } from './queries';
import { ResponseDialog } from './ResponseDialog';
import { titleOf } from './responseTitle';
import { ResponseView } from './ResponseView';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; response: ResponseDto }
  | { kind: 'cancel'; response: ResponseDto }
  | { kind: 'delete'; response: ResponseDto };

/**
 * The «Відповідь» tab of the card: every response in its own frame, the first on the left and
 * each next one to the right of it (cancelled ones muted). ＋ adds another response — e.g. when
 * the customer has not corrected everything the previous one asked for.
 */
export function ResponsesTab({ app }: { app: ApplicationDto }) {
  const user = useCurrentUser();
  const responses = useResponses(app.id);
  const cancel = useCancelResponse(app.id);
  const restore = useRestoreResponse(app.id);
  const remove = useDeleteResponse(app.id);
  const [deleteError, setDeleteError] = useState<string>();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [error, setError] = useState<string>();
  const close = () => {
    setDialog({ kind: 'none' });
    setDeleteError(undefined);
  };
  const manage = canManageDocuments(app, user);

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setError(undefined);
    try {
      await action();
      if (done) notifySuccess(done);
    } catch (e) {
      setError(toApiError(e).message);
    }
  };
  const openScanOf = (response: ResponseDto, fileId?: string, name = response.scan?.name ?? '') =>
    run(() => openPdf(() => responsesApi.scanFile(app.id, response.id, fileId), name));

  if (responses.isPending) return <Spinner label="Завантаження відповідей…" />;
  if (responses.isError) {
    return (
      <Alert variant="error">
        {toApiError(responses.error).message}{' '}
        <Button size="sm" onClick={() => responses.refetch()}>
          Повторити
        </Button>
      </Alert>
    );
  }

  return (
    <>
      {error && <Alert variant="error">{error}</Alert>}

      {responses.data.length === 0 ? (
        <p className={styles.muted}>Відповідей на заяву не надавали.</p>
      ) : (
        <div className={styles.frames}>
          {responses.data.map((response) => (
            <article
              key={response.id}
              aria-label={`Відповідь ${titleOf(response)}`}
              className={clsx(styles.frame, response.cancellation && styles.frameCancelled)}
            >
              {response.cancellation && (
                <span className={styles.frameBadge}>
                  <Badge tone="danger">Скасовано</Badge>
                </span>
              )}
              <div className={styles.frameBody}>
                <ResponseView response={response} />
                <PreviousScans
                  scans={response.previousScans}
                  onOpen={(scan) => openScanOf(response, scan.id, scan.name)}
                />
              </div>
              <div className={styles.frameFooter}>
                {response.cancellation && <CancellationNote cancellation={response.cancellation} />}
                <div className={styles.frameActions}>
                  {response.scan && (
                    <IconButton
                      icon="eye"
                      label="Відкрити скан"
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
                          () => restore.mutateAsync({ id: response.id, version: response.version }),
                          `Відповідь № ${response.outgoingNumber} відновлено`,
                        )
                      }
                    />
                  )}
                  {canDeleteDocument(app, user) && (
                    <IconButton
                      icon="trash"
                      label="Видалити"
                      tone="danger"
                      onClick={() => setDialog({ kind: 'delete', response })}
                    />
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <CardFooter
        actions={
          manage && (
            <IconButton
              icon="plus"
              label="Додати відповідь"
              onClick={() => setDialog({ kind: 'create' })}
            />
          )
        }
      />

      {(dialog.kind === 'create' || dialog.kind === 'edit') && (
        <ResponseDialog
          app={app}
          response={dialog.kind === 'edit' ? dialog.response : undefined}
          onClose={close}
          onSaved={(saved) => {
            setError(undefined);
            notifySuccess(
              dialog.kind === 'edit'
                ? `Відповідь № ${saved.outgoingNumber} збережено`
                : `Відповідь № ${saved.outgoingNumber} додано`,
            );
            close();
          }}
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
      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          danger
          title={`Видалити відповідь № ${dialog.response.outgoingNumber}?`}
          confirmLabel="Видалити"
          loading={remove.isPending}
          error={deleteError}
          onCancel={close}
          onConfirm={async () => {
            const { response } = dialog;
            setDeleteError(undefined);
            try {
              await remove.mutateAsync({ id: response.id, version: response.version });
              close();
              notifySuccess(`Відповідь № ${response.outgoingNumber} видалено`);
            } catch (e) {
              setDeleteError(toApiError(e).message);
            }
          }}
        >
          <p>Відповідь і всі її скани буде видалено назавжди. Цю дію не можна скасувати.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
