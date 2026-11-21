import {
  type ApplicationDto,
  type EstimateDto,
  formatHryvnias,
  type ProjectDto,
} from '@tu-registry/shared';
import { useState } from 'react';
import { canDeleteDocument, canManageDocuments } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import { DocumentFrame, documentStyles as styles } from '@/features/documents';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate, formatDateTime, shortName } from '@/shared/lib/format';
import { notifyError, notifySuccess } from '@/shared/lib/notify';
import { downloadFile, openPdf } from '@/shared/lib/pdf';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataList,
  DataRow,
  IconButton,
  LoadFailed,
  Spinner,
} from '@/shared/ui';
import { estimatesApi } from './api';
import { EstimateDialog } from './EstimateDialog';
import { useDeleteEstimate, useEstimates } from './queries';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create'; recalculation: boolean }
  | { kind: 'edit'; estimate: EstimateDto }
  | { kind: 'delete'; estimate: EstimateDto };

/**
 * «Кошторис» beside its project (split on 2026-11-21, like the payment beside its TU): the
 * customer may pay long after, so the estimate is recalculated without the project being approved
 * again. ＋ adds the recalculated one; the replaced ones stay «Перераховано» with their files and
 * are paged with ‹ ›. Only the current estimate of the valid project changes.
 */
export function EstimateFrame({ app, project }: { app: ApplicationDto; project: ProjectDto }) {
  const user = useCurrentUser();
  const list = useEstimates(app.id);
  const remove = useDeleteEstimate(app.id);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  // The estimate paged to; the current one until the user pages.
  const [shownId, setShownId] = useState<string | null>(null);
  const close = () => setDialog({ kind: 'none' });
  const cancelled = Boolean(project.cancellation);
  const manage = canManageDocuments(app, user) && !cancelled;
  const label = `Кошторис до проєкту № ${project.approvalNumber}`;

  const openFile = async (estimate: EstimateDto, kind: 'scan' | 'imd') => {
    const load = () => estimatesApi.file(app.id, estimate.id, kind);
    try {
      await (kind === 'imd'
        ? downloadFile(load, estimate.imd?.name ?? 'кошторис.imd')
        : openPdf(load, estimate.scan?.name ?? 'кошторис.pdf'));
    } catch (e) {
      notifyError(toApiError(e).message);
    }
  };

  const body = () => {
    if (list.isPending) return <Spinner label="Завантаження кошторису…" />;
    if (list.isError) return <LoadFailed error={list.error} onRetry={() => list.refetch()} />;
    return null;
  };
  const estimates = (list.data ?? []).filter((estimate) => estimate.projectId === project.id);
  const current = estimates.find((estimate) => !estimate.superseded);
  const shown =
    estimates.find((estimate) => estimate.id === shownId) ?? current ?? estimates.at(-1);
  const position = shown ? estimates.indexOf(shown) : -1;

  return (
    <>
      {!shown ? (
        <DocumentFrame title="Кошторис" label={label} cancelled={cancelled}>
          {body() ?? (
            <div className={styles.frameEmpty}>
              {manage ? (
                <Button onClick={() => setDialog({ kind: 'create', recalculation: false })}>
                  Додати кошторис
                </Button>
              ) : (
                <p className={styles.muted}>Кошторис ще не внесено.</p>
              )}
            </div>
          )}
        </DocumentFrame>
      ) : (
        <DocumentFrame
          title="Кошторис"
          label={label}
          cancelled={cancelled}
          footer={
            <>
              <div className={styles.frameScans}>
                {shown.scan && (
                  <IconButton
                    icon="eye"
                    label="Переглянути скан кошторису"
                    title={shown.scan.name}
                    onClick={() => openFile(shown, 'scan')}
                  />
                )}
                {shown.imd && (
                  <IconButton
                    icon="download"
                    label="Завантажити файл перевірки кошторису (.imd)"
                    title={shown.imd.name}
                    onClick={() => openFile(shown, 'imd')}
                  />
                )}
              </div>
              <div className={styles.frameFooterEnd}>
                {estimates.length > 1 && (
                  <div className={styles.frameActions}>
                    <IconButton
                      icon="chevronLeft"
                      label="Попередній кошторис"
                      disabled={position === 0}
                      onClick={() => setShownId(estimates[position - 1]!.id)}
                    />
                    <IconButton
                      icon="chevronRight"
                      label="Наступний кошторис"
                      disabled={position === estimates.length - 1}
                      onClick={() => setShownId(estimates[position + 1]!.id)}
                    />
                  </div>
                )}
                <div className={styles.frameActions}>
                  {manage && (
                    <IconButton
                      icon="plus"
                      label="Перерахувати кошторис"
                      onClick={() => setDialog({ kind: 'create', recalculation: Boolean(current) })}
                    />
                  )}
                  {manage && !shown.superseded && (
                    <IconButton
                      icon="pencil"
                      label="Редагувати кошторис"
                      onClick={() => setDialog({ kind: 'edit', estimate: shown })}
                    />
                  )}
                  {canDeleteDocument(app, user) && (
                    <IconButton
                      icon="trash"
                      label="Видалити кошторис"
                      tone="danger"
                      onClick={() => setDialog({ kind: 'delete', estimate: shown })}
                    />
                  )}
                </div>
              </div>
            </>
          }
        >
          {shown.superseded && (
            <span className={styles.frameBadge}>
              <Badge>Перераховано</Badge>
            </span>
          )}
          <DataList labels="fixed">
            <DataRow label="Дата перевірки">
              {shown.checkDate ? formatCalendarDate(shown.checkDate) : '—'}
            </DataRow>
            <DataRow label="Сума кошторису">
              {shown.amount === null ? '—' : formatHryvnias(shown.amount)}
            </DataRow>
            <DataRow label="Внесено">{formatDateTime(shown.createdAt)}</DataRow>
            {shown.superseded && (
              <DataRow label="Перераховано">
                {formatDateTime(shown.superseded.at)},{' '}
                <span title={shown.superseded.by.fullName}>
                  {shortName(shown.superseded.by.fullName)}
                </span>
              </DataRow>
            )}
          </DataList>
        </DocumentFrame>
      )}

      {(dialog.kind === 'create' || dialog.kind === 'edit') && (
        <EstimateDialog
          applicationId={app.id}
          estimate={dialog.kind === 'edit' ? dialog.estimate : undefined}
          recalculation={dialog.kind === 'create' && dialog.recalculation}
          onClose={close}
          onSaved={(saved) => {
            notifySuccess(dialog.kind === 'edit' ? 'Кошторис збережено' : 'Кошторис додано');
            // The new one is shown, whatever was paged to.
            setShownId(saved.id);
            close();
          }}
        />
      )}
      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          danger
          title="Видалити кошторис?"
          confirmLabel="Видалити"
          loading={remove.isPending}
          onCancel={close}
          onConfirm={async () => {
            const { estimate } = dialog;
            try {
              await remove.mutateAsync({ id: estimate.id, version: estimate.version });
              setShownId(null);
              close();
              notifySuccess('Кошторис видалено');
            } catch (e) {
              notifyError(toApiError(e).message);
            }
          }}
        >
          <p>
            Кошторис і його файли буде видалено назавжди; якщо він чинний, чинним знову стане
            попередній. Цю дію не можна скасувати.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
