import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import {
  AnnulDialog,
  ApplicationDetails,
  CollapsibleHistory,
  canAnnul,
  canDelete,
  canEdit,
  DeleteDialog,
  canRestore,
  openScan,
  useApplication,
  useRestoreApplication,
} from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import { ProcessingSection } from '@/features/processing';
import { ResponsesSection } from '@/features/responses';
import { TechnicalConditionsSection } from '@/features/technicalConditions';
import { toApiError } from '@/shared/api/apiError';
import { PROCESSING_STAGE_LABELS } from '@/shared/lib/labels';
import {
  Alert,
  Badge,
  Button,
  CardBlock,
  ConfirmDialog,
  IconButton,
  IconLink,
  Spinner,
} from '@/shared/ui';
import pageStyles from '../page.module.scss';
import type { RegistryPageState } from '../RegistryPage/RegistryPage';
import styles from './ApplicationPage.module.scss';

/** Navigation state: where "back to registry" returns, and a one-off message. */
export type ApplicationPageState = { registrySearch?: string; notice?: string } | null;

export function ApplicationPage() {
  const { id = '' } = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const state = useLocation().state as ApplicationPageState;
  const application = useApplication(id);
  const restore = useRestoreApplication(id);
  const [dialog, setDialog] = useState<'annul' | 'restore' | 'delete' | null>(null);
  const [restoreError, setRestoreError] = useState<string>();
  const [scanError, setScanError] = useState<string>();

  const registry = { pathname: '/', search: state?.registrySearch ?? '' };
  const backLink = (
    <Link to={registry} className={styles.back}>
      ← До реєстру
    </Link>
  );

  if (application.isPending) return <Spinner label="Завантаження заяви…" />;
  if (application.isError) {
    const error = toApiError(application.error);
    return (
      <section className={pageStyles.narrow}>
        {backLink}
        <h1>{error.status === 404 ? 'Заяву не знайдено' : 'Не вдалося завантажити заяву'}</h1>
        {error.status !== 404 && (
          <Alert variant="error">
            {error.message}{' '}
            <Button size="sm" onClick={() => application.refetch()}>
              Повторити
            </Button>
          </Alert>
        )}
      </section>
    );
  }

  const app = application.data;
  const closeDialog = () => {
    setDialog(null);
    setRestoreError(undefined);
  };
  const viewScan = async () => {
    setScanError(undefined);
    try {
      await openScan(app.id, app.scan!.name);
    } catch (e) {
      setScanError(`Не вдалося відкрити скан: ${toApiError(e).message}`);
    }
  };
  const confirmRestore = async () => {
    try {
      await restore.mutateAsync(app.version);
      closeDialog();
    } catch (e) {
      setRestoreError(toApiError(e).message);
    }
  };

  return (
    <section className={pageStyles.wide}>
      {backLink}
      {/* The title: what the application is, at a glance. Actions live in the blocks. */}
      <header className={styles.header}>
        <div className={styles.title}>
          <h1>Заява {app.regNumber}</h1>
          {app.registrationMode === 'MANUAL' && <Badge>вручну</Badge>}
          {app.status === 'ANNULLED' ? (
            <Badge tone="danger">Анульовано</Badge>
          ) : (
            <Badge tone="info">{PROCESSING_STAGE_LABELS[app.stage]}</Badge>
          )}
        </div>
        <p className={styles.customer}>{app.customer}</p>
        <p className={styles.address}>
          {[app.settlement, app.objectAddress].filter(Boolean).join(', ')}
        </p>
      </header>

      {state?.notice && <Alert variant="success">{state.notice}</Alert>}
      {scanError && <Alert variant="error">{scanError}</Alert>}

      <div className={styles.layout}>
        <aside className={styles.side}>
          <ProcessingSection app={app} />
        </aside>
        <div className={styles.blocks}>
          <CardBlock
            title="Заява"
            tone={app.status === 'ANNULLED' ? 'danger' : 'default'}
            actions={
              <>
                {app.scan && <IconButton icon="eye" label="Переглянути скан" onClick={viewScan} />}
                {canEdit(app, user) && (
                  <IconLink
                    icon="pencil"
                    label="Редагувати"
                    to={`/applications/${app.id}/edit`}
                    state={state}
                  />
                )}
                {canAnnul(app, user) && (
                  <IconButton
                    icon="ban"
                    label="Анулювати"
                    tone="danger"
                    onClick={() => setDialog('annul')}
                  />
                )}
                {canRestore(app, user) && (
                  <IconButton
                    icon="restore"
                    label="Відновити"
                    onClick={() => setDialog('restore')}
                  />
                )}
                {canDelete(app, user) && (
                  <IconButton
                    icon="trash"
                    label="Видалити"
                    tone="danger"
                    onClick={() => setDialog('delete')}
                  />
                )}
              </>
            }
          >
            <ApplicationDetails app={app} />
          </CardBlock>
          <ResponsesSection app={app} />
          <TechnicalConditionsSection app={app} />
          <CollapsibleHistory applicationId={app.id} />
        </div>
      </div>

      {dialog === 'annul' && <AnnulDialog app={app} onClose={closeDialog} />}
      {dialog === 'delete' && (
        <DeleteDialog
          app={app}
          onClose={closeDialog}
          onDeleted={() =>
            navigate(registry, {
              state: { notice: `Заяву ${app.regNumber} видалено` } satisfies RegistryPageState,
            })
          }
        />
      )}
      {dialog === 'restore' && (
        <ConfirmDialog
          open
          title={`Відновити заяву ${app.regNumber}?`}
          confirmLabel="Відновити"
          loading={restore.isPending}
          error={restoreError}
          onCancel={closeDialog}
          onConfirm={confirmRestore}
        >
          <p>Заява знову стане активною, і її можна буде редагувати.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
