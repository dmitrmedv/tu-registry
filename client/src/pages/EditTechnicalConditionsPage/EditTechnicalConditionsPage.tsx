import { useNavigate, useParams } from 'react-router';
import {
  canManageDocuments,
  ScanPanel,
  scanChangeMessage,
  useApplication,
} from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import {
  EditTechnicalConditionsForm,
  openTechnicalConditionsScan,
  useTechnicalConditions,
  useTechnicalConditionsScanChange,
} from '@/features/technicalConditions';
import { toApiError } from '@/shared/api/apiError';
import { notifySuccess } from '@/shared/lib/notify';
import { Alert, LinkButton, Spinner } from '@/shared/ui';
import pageStyles from '../page.module.scss';

/** Editing saved technical conditions: a page like the application's (agreed 2026-11-17). */
export function EditTechnicalConditionsPage() {
  const { id = '', tid = '' } = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const application = useApplication(id);
  const list = useTechnicalConditions(id);
  const scanChange = useTechnicalConditionsScanChange(id, tid);
  const tabPath = `/applications/${id}?tab=tu`;

  if (application.isPending || list.isPending) return <Spinner label="Завантаження ТУ…" />;
  const failure = application.error ?? list.error;
  if (failure) return <Alert variant="error">{toApiError(failure).message}</Alert>;

  const app = application.data!;
  const tu = list.data!.find((item) => item.id === tid);
  const unavailable = !tu
    ? 'Таких технічних умов у заяві немає.'
    : !canManageDocuments(app, user)
      ? 'Змінювати ТУ можна лише в активних заявах свого управління.'
      : tu.cancellation
        ? 'Скасовані технічні умови не редагуються.'
        : null;
  if (!tu || unavailable) {
    return (
      <section className={pageStyles.narrow}>
        <h1>Редагування недоступне</h1>
        <p className={pageStyles.muted}>{unavailable}</p>
        <div>
          <LinkButton to={tabPath}>До заяви {app.regNumber}</LinkButton>
        </div>
      </section>
    );
  }

  return (
    <section className={pageStyles.centered}>
      <h1>
        Редагування ТУ № {tu.tuNumber} · заява {app.regNumber}
      </h1>
      <div className={pageStyles.withSide}>
        <div className={pageStyles.side}>
          <ScanPanel
            title="Скан технічних умов"
            scan={tu.scan}
            scanChange={scanChange}
            onView={() => openTechnicalConditionsScan(app.id, tu)}
          />
        </div>
        <EditTechnicalConditionsForm
          // A new version (saved fields, then a failed scan) rebuilds the form from fresh data.
          key={tu.version}
          app={app}
          technicalConditions={tu}
          scanChanged={scanChange.changed}
          applyScan={scanChange.apply}
          cancelTo={tabPath}
          onSaved={({ fields }) => {
            notifySuccess(
              fields
                ? `Технічні умови № ${tu.tuNumber} збережено`
                : scanChangeMessage(scanChange.change, tu.scan !== null),
            );
            navigate(tabPath, { replace: true });
          }}
        />
      </div>
    </section>
  );
}
