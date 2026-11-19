import { useLocation, useNavigate, useParams } from 'react-router';
import {
  canEdit,
  canChangeDepartment,
  canEditRegistration,
  EditApplicationForm,
  openScan,
  ScanPanel,
  scanChangeMessage,
  useApplication,
  useRemoveScan,
  useScanChange,
  useUploadScan,
} from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import { LinkButton, LoadFailed, Spinner } from '@/shared/ui';
import { notifySuccess } from '@/shared/lib/notify';
import type { ApplicationPageState } from '../ApplicationPage';
import pageStyles from '../page.module.scss';

export function EditApplicationPage() {
  const { id = '' } = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const state = useLocation().state as ApplicationPageState;
  const application = useApplication(id);
  const cardPath = `/applications/${id}`;
  const upload = useUploadScan();
  const remove = useRemoveScan();
  const scanChange = useScanChange({
    upload: (file, onProgress) => upload.mutateAsync({ id, file, onProgress }),
    remove: () => remove.mutateAsync(id),
  });

  if (application.isPending) return <Spinner label="Завантаження заяви…" />;
  if (application.isError) {
    return <LoadFailed error={application.error} onRetry={() => application.refetch()} />;
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
    <section className={pageStyles.centered}>
      <h1>Редагування заяви {app.regNumber}</h1>
      <div className={pageStyles.withSide}>
        <div className={pageStyles.side}>
          <ScanPanel
            title="Скан пакета документів"
            scan={app.scan}
            scanChange={scanChange}
            onView={() => openScan(app.id, app.scan!.name)}
          />
        </div>
        <EditApplicationForm
          // A new version (after a conflict reload) rebuilds the form from fresh data.
          key={app.version}
          app={app}
          canEditRegistration={canEditRegistration(app, user)}
          canChangeDepartment={canChangeDepartment(app, user)}
          cancelTo={cardPath}
          scanChanged={scanChange.changed}
          applyScan={scanChange.apply}
          onReload={() => application.refetch()}
          onSaved={({ fields }) => {
            notifySuccess(
              fields ? 'Зміни збережено' : scanChangeMessage(scanChange.change, app.scan !== null),
            );
            navigate(cardPath, { replace: true, state });
          }}
        />
      </div>
    </section>
  );
}
