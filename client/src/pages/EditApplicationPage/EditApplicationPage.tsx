import { useLocation, useNavigate, useParams } from 'react-router';
import {
  canEdit,
  canChangeDepartment,
  canEditRegistration,
  EditApplicationForm,
  ScanPanel,
  useApplication,
} from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import { toApiError } from '@/shared/api/apiError';
import { Alert, LinkButton, Spinner } from '@/shared/ui';
import type { ApplicationPageState } from '../ApplicationPage';
import pageStyles from '../page.module.scss';

export function EditApplicationPage() {
  const { id = '' } = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const state = useLocation().state as ApplicationPageState;
  const application = useApplication(id);
  const cardPath = `/applications/${id}`;

  if (application.isPending) return <Spinner label="Завантаження заяви…" />;
  if (application.isError) {
    return <Alert variant="error">{toApiError(application.error).message}</Alert>;
  }

  const app = application.data;
  if (!canEdit(app, user)) {
    return (
      <section className={pageStyles.narrow}>
        <h1>Редагування недоступне</h1>
        <p className={pageStyles.muted}>
          {app.status === 'ANNULLED'
            ? 'Анульовану заяву не можна редагувати. Спершу її має відновити адміністратор.'
            : 'Редагувати можна лише власні заяви.'}
        </p>
        <div>
          <LinkButton to={cardPath} state={state}>
            До заяви {app.regNumber}
          </LinkButton>
        </div>
      </section>
    );
  }

  return (
    <section className={pageStyles.wide}>
      <h1>Редагування заяви {app.regNumber}</h1>
      <div className={pageStyles.withSide}>
        <div className={pageStyles.side}>
          {/* Scan changes are saved at once and do not touch the form's unsaved edits. */}
          <ScanPanel app={app} />
        </div>
        <EditApplicationForm
          // A new version (after a conflict reload) rebuilds the form from fresh data.
          key={app.version}
          app={app}
          canEditRegistration={canEditRegistration(app, user)}
          canChangeDepartment={canChangeDepartment(app, user)}
          cancelTo={cardPath}
          onReload={() => application.refetch()}
          onSaved={() =>
            navigate(cardPath, { replace: true, state: { ...state, notice: 'Зміни збережено' } })
          }
        />
      </div>
    </section>
  );
}
