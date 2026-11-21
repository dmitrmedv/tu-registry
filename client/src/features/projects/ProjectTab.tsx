import type { ApplicationDto, ProjectDto } from '@tu-registry/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { canDeleteDocument, canManageDocuments, canRestoreDocument } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import { EstimateFrame } from '@/features/estimates';
import {
  CancelDocumentDialog,
  DocumentFrame,
  DocumentNotes,
  documentStyles as styles,
  ScanButton,
} from '@/features/documents';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate, formatDateTime, shortName } from '@/shared/lib/format';
import { notifyError, notifySuccess } from '@/shared/lib/notify';
import { openPdf } from '@/shared/lib/pdf';
import {
  Badge,
  CardFooter,
  ConfirmDialog,
  DataList,
  DataRow,
  IconButton,
  LoadFailed,
  Spinner,
} from '@/shared/ui';
import { projectsApi } from './api';
import { ProjectDialog } from './ProjectDialog';
import { useCancelProject, useDeleteProject, useProjects, useRestoreProject } from './queries';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; project: ProjectDto }
  | { kind: 'cancel'; project: ProjectDto }
  | { kind: 'delete'; project: ProjectDto };

const titleOf = (project: ProjectDto) =>
  `№ ${project.approvalNumber} від ${formatCalendarDate(project.approvalDate)}`;

/**
 * The «Проєкт» tab of the card: the project and the «Кошторис» of the project shown side by side,
 * each in its frame (2026-11-21). The estimate is a document of its own (`EstimateFrame`): it is
 * recalculated without the project. The valid project first, cancelled ones paged with ‹ ›. ＋ adds
 * a new one only while there is no valid one (the server enforces it too).
 */
export function ProjectTab({ app }: { app: ApplicationDto }) {
  const user = useCurrentUser();
  const list = useProjects(app.id);
  const cancel = useCancelProject(app.id);
  const restore = useRestoreProject(app.id);
  const remove = useDeleteProject(app.id);
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
  const openScanOf = (project: ProjectDto, fileId?: string, name = project.scan?.name ?? '') =>
    run(() => openPdf(() => projectsApi.scanFile(app.id, project.id, fileId), name));

  if (list.isPending) return <Spinner label="Завантаження проєктів…" />;
  if (list.isError) return <LoadFailed error={list.error} onRetry={() => list.refetch()} />;

  const projects = list.data;
  const valid = projects.find((project) => !project.cancellation);
  // The project paged to; the valid one (or the latest) until the user pages.
  const shown = projects.find((project) => project.id === shownId) ?? valid ?? projects.at(-1);
  const position = shown ? projects.indexOf(shown) : -1;
  const addButton = manage && !valid && (
    <IconButton icon="plus" label="Додати проєкт" onClick={() => setDialog({ kind: 'create' })} />
  );

  return (
    <>
      {shown ? (
        <div className={clsx(styles.split, styles.splitFill)}>
          <DocumentFrame
            title="Проєкт"
            label={`Проєкт ${titleOf(shown)}`}
            cancelled={Boolean(shown.cancellation)}
            footer={
              <>
                {shown.scan && (
                  <ScanButton title={shown.scan.name} onClick={() => openScanOf(shown)} />
                )}
                <div className={styles.frameFooterEnd}>
                  {projects.length > 1 && (
                    <div className={styles.frameActions}>
                      <IconButton
                        icon="chevronLeft"
                        label="Попередній проєкт"
                        disabled={position === 0}
                        onClick={() => setShownId(projects[position - 1]!.id)}
                      />
                      <IconButton
                        icon="chevronRight"
                        label="Наступний проєкт"
                        disabled={position === projects.length - 1}
                        onClick={() => setShownId(projects[position + 1]!.id)}
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
                          onClick={() => setDialog({ kind: 'edit', project: shown })}
                        />
                        <IconButton
                          icon="ban"
                          label="Скасувати"
                          tone="danger"
                          onClick={() => setDialog({ kind: 'cancel', project: shown })}
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
                            `Проєкт № ${shown.approvalNumber} відновлено`,
                          )
                        }
                      />
                    )}
                    {canDeleteDocument(app, user) && (
                      <IconButton
                        icon="trash"
                        label="Видалити"
                        tone="danger"
                        onClick={() => setDialog({ kind: 'delete', project: shown })}
                      />
                    )}
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
            <DataList labels="fixed">
              <DataRow label="Узгодження">{titleOf(shown)}</DataRow>
              <DataRow label="Виконавець">
                <span title={shown.engineer.fullName}>{shortName(shown.engineer.fullName)}</span>
              </DataRow>
              <DataRow label="Внесено">{formatDateTime(shown.createdAt)}</DataRow>
            </DataList>
            <DocumentNotes
              cancellation={shown.cancellation}
              previousScans={shown.previousScans}
              onOpenScan={(scan) => openScanOf(shown, scan.id, scan.name)}
            />
          </DocumentFrame>
          <EstimateFrame key={shown.id} app={app} project={shown} />
        </div>
      ) : (
        <>
          <p className={styles.muted}>Проєкт ще не внесено.</p>
          <CardFooter actions={addButton} />
        </>
      )}

      {(dialog.kind === 'create' || dialog.kind === 'edit') && (
        <ProjectDialog
          app={app}
          project={dialog.kind === 'edit' ? dialog.project : undefined}
          onClose={close}
          onSaved={(saved) => {
            notifySuccess(
              `Проєкт № ${saved.approvalNumber} ${dialog.kind === 'edit' ? 'збережено' : 'додано'}`,
            );
            close();
          }}
        />
      )}
      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          danger
          title={`Видалити проєкт № ${dialog.project.approvalNumber}?`}
          confirmLabel="Видалити"
          loading={remove.isPending}
          onCancel={close}
          onConfirm={async () => {
            const { project } = dialog;
            try {
              await remove.mutateAsync({ id: project.id, version: project.version });
              close();
              notifySuccess(`Проєкт № ${project.approvalNumber} видалено`);
            } catch (e) {
              notifyError(toApiError(e).message);
            }
          }}
        >
          <p>
            Проєкт, кошторис і всі їхні файли буде видалено назавжди. Цю дію не можна скасувати.
          </p>
        </ConfirmDialog>
      )}
      {dialog.kind === 'cancel' && (
        <CancelDocumentDialog
          title={`Скасувати проєкт № ${dialog.project.approvalNumber}?`}
          onClose={close}
          onConfirm={(reason) =>
            cancel.mutateAsync({
              id: dialog.project.id,
              input: { reason, version: dialog.project.version },
            })
          }
        />
      )}
    </>
  );
}
