import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import {
  AnnulDialog,
  ApplicationDetails,
  ApplicationHistory,
  canAnnul,
  canEdit,
  canRestore,
  useApplication,
  useRestoreApplication,
} from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import { toApiError } from '@/shared/api/apiError';
import { Alert, Badge, Button, ConfirmDialog, LinkButton, Spinner } from '@/shared/ui';
import pageStyles from '../page.module.scss';
import styles from './ApplicationPage.module.scss';

/** Navigation state: where "back to registry" returns, and a one-off message. */
export type ApplicationPageState = { registrySearch?: string; notice?: string } | null;

export function ApplicationPage() {
  const { id = '' } = useParams();
  const user = useCurrentUser();
  const state = useLocation().state as ApplicationPageState;
  const application = useApplication(id);
  const restore = useRestoreApplication(id);
  const [dialog, setDialog] = useState<'annul' | 'restore' | null>(null);
  const [restoreError, setRestoreError] = useState<string>();

  const backLink = (
    <Link to={{ pathname: '/', search: state?.registrySearch ?? '' }} className={styles.back}>
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
      <div className={pageStyles.header}>
        <div className={styles.title}>
          <h1>Заява {app.regNumber}</h1>
          {app.registrationMode === 'MANUAL' && <Badge>вручну</Badge>}
          {app.status === 'ANNULLED' && <Badge tone="danger">Анульовано</Badge>}
        </div>
        <div className={styles.actions}>
          {canEdit(app, user) && (
            <LinkButton to={`/applications/${app.id}/edit`} state={state} variant="primary">
              Редагувати
            </LinkButton>
          )}
          {canAnnul(app, user) && (
            <Button variant="danger" onClick={() => setDialog('annul')}>
              Анулювати
            </Button>
          )}
          {canRestore(app, user) && <Button onClick={() => setDialog('restore')}>Відновити</Button>}
        </div>
      </div>

      {state?.notice && <Alert variant="success">{state.notice}</Alert>}

      <ApplicationDetails app={app} />

      <h2 className={styles.historyTitle}>Історія змін</h2>
      <ApplicationHistory applicationId={app.id} />

      {dialog === 'annul' && <AnnulDialog app={app} onClose={closeDialog} />}
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
