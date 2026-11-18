import { fullAddress, type TimelineEventDto } from '@tu-registry/shared';
import { useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  AnnulDialog,
  ApplicationDetails,
  canAnnul,
  canDelete,
  canEdit,
  canManageDocuments,
  canRestore,
  DeleteDialog,
  HistoryDialog,
  openScan,
  useApplication,
  useRestoreApplication,
} from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import {
  CARD_MODULES,
  type CardModuleId,
  ChooseModuleDialog,
  useModulePresence,
} from '@/features/cardModules';
import { useDepartments } from '@/features/departments';
import { ScanButton } from '@/features/documents';
import { ProcessingSection } from '@/features/processing';
import { toApiError } from '@/shared/api/apiError';
import { useHeightVariable } from '@/shared/hooks/useHeightVariable';
import { formatObjectCategory } from '@/shared/lib/labels';
import {
  Alert,
  Badge,
  Button,
  CardFooter,
  ConfirmDialog,
  IconButton,
  IconLink,
  Spinner,
  Tabs,
} from '@/shared/ui';
import pageStyles from '../page.module.scss';
import { notifySuccess } from '@/shared/lib/notify';
import styles from './ApplicationPage.module.scss';

/** Navigation state: where "back to registry" returns, and a one-off message. */
export type ApplicationPageState = { registrySearch?: string } | null;

type TabId = 'application' | CardModuleId;

/** «Житловий будинок» → «житловий будинок», as a line of the title. */
const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase('uk') + text.slice(1);

/** The tab of a timeline event: the module it belongs to, or the application itself. */
const tabOfEvent = (event: TimelineEventDto): TabId =>
  CARD_MODULES.find((module) => (module.eventTypes as string[]).includes(event.type))?.id ??
  'application';

export function ApplicationPage() {
  const { id = '' } = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ApplicationPageState;
  const [searchParams, setSearchParams] = useSearchParams();
  const application = useApplication(id);
  const restore = useRestoreApplication(id);
  const presence = useModulePresence(id);
  const { nameOf } = useDepartments();
  const headerRef = useHeightVariable<HTMLElement>('--card-header-height');
  const [dialog, setDialog] = useState<
    'annul' | 'restore' | 'delete' | 'history' | 'module' | null
  >(null);
  const [adding, setAdding] = useState<CardModuleId | null>(null);
  const [restoreError, setRestoreError] = useState<string>();
  const [scanError, setScanError] = useState<string>();

  const registry = { pathname: '/', search: state?.registrySearch ?? '' };

  if (application.isPending) return <Spinner label="Завантаження заяви…" />;
  if (application.isError) {
    const error = toApiError(application.error);
    return (
      <section className={pageStyles.narrow}>
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
  const present = CARD_MODULES.filter((module) => presence[module.id]);
  const tabs = [
    { id: 'application' as TabId, label: 'Заява' },
    ...present.map((module) => ({ id: module.id as TabId, label: module.tabLabel })),
  ];
  // The tab lives in the address, so a reload or a shared link opens the same one.
  const requested = searchParams.get('tab');
  const selected = tabs.find((tab) => tab.id === requested)?.id ?? 'application';
  const selectTab = (tab: TabId) =>
    setSearchParams(
      (params) => {
        if (tab === 'application') params.delete('tab');
        else params.set('tab', tab);
        return params;
      },
      { replace: true, state },
    );
  const addingModule = CARD_MODULES.find((module) => module.id === adding);
  const SelectedTab = CARD_MODULES.find((module) => module.id === selected)?.Tab;

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
      {/* The title stays in view while the card scrolls: which application this is. */}
      <header ref={headerRef} className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.title}>
            <h1>Заява {app.regNumber}</h1>
            {app.registrationMode === 'MANUAL' && <Badge>вручну</Badge>}
            {/* No stage badge (agreed 2026-11-17): the timeline and the tabs show it. */}
            {app.status === 'ANNULLED' && <Badge tone="danger">Анульовано</Badge>}
          </div>
          <p className={styles.strong}>{fullAddress(app.settlement, app.objectAddress)}</p>
          <p className={styles.strong}>{app.customer}</p>
        </div>
        {/* Right of the number, level with it: the department and the kind of object. */}
        <div className={styles.meta}>
          <p>{nameOf(app.department)} управління</p>
          <p>{lowerFirst(formatObjectCategory(app.objectCategory, app.objectCategoryOther))}</p>
        </div>
        {canManageDocuments(app, user) && (
          <Button className={styles.addModule} onClick={() => setDialog('module')}>
            Додати модуль
          </Button>
        )}
      </header>

      {scanError && <Alert variant="error">{scanError}</Alert>}

      <div className={styles.layout}>
        <aside className={styles.side}>
          <ProcessingSection
            app={app}
            onSelectEvent={(event) => selectTab(tabOfEvent(event))}
            toolbar={
              <Button size="sm" onClick={() => setDialog('history')}>
                Історія змін
              </Button>
            }
          />
        </aside>
        <Tabs
          label="Модулі заяви"
          tabs={tabs}
          selected={selected}
          onSelect={selectTab}
          panelClassName={styles.tabPanel}
        >
          {SelectedTab ? (
            <SelectedTab key={selected} app={app} />
          ) : (
            <>
              <ApplicationDetails app={app} />
              <CardFooter
                start={app.scan && <ScanButton title={app.scan.name} onClick={viewScan} />}
                actions={
                  (canEdit(app, user) ||
                    canAnnul(app, user) ||
                    canRestore(app, user) ||
                    canDelete(app, user)) && (
                    <>
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
                  )
                }
              />
            </>
          )}
        </Tabs>
      </div>

      {addingModule && (
        <addingModule.AddDialog
          app={app}
          onClose={() => setAdding(null)}
          onAdded={(message) => {
            setAdding(null);
            notifySuccess(message);
            selectTab(addingModule.id);
          }}
        />
      )}
      {dialog === 'module' && (
        <ChooseModuleDialog
          added={(module) => presence[module] !== false}
          onClose={closeDialog}
          onChoose={(module) => {
            closeDialog();
            setAdding(module);
          }}
        />
      )}
      {dialog === 'history' && <HistoryDialog applicationId={app.id} onClose={closeDialog} />}
      {dialog === 'annul' && <AnnulDialog app={app} onClose={closeDialog} />}
      {dialog === 'delete' && (
        <DeleteDialog
          app={app}
          onClose={closeDialog}
          onDeleted={() => {
            notifySuccess(`Заяву ${app.regNumber} видалено`);
            navigate(registry);
          }}
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
