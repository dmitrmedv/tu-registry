import { type ApplicationDto, type ContractDto, type ContractFileKind } from '@tu-registry/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { canDeleteDocument, canManageDocuments } from '@/features/applications';
import { useCurrentUser } from '@/features/auth';
import {
  CancelDocumentDialog,
  CancellationNote,
  DocumentFrame,
  documentStyles as styles,
} from '@/features/documents';
import { toApiError } from '@/shared/api/apiError';
import { formatCalendarDate } from '@/shared/lib/format';
import { notifyError, notifySuccess } from '@/shared/lib/notify';
import {
  Badge,
  Button,
  CardFooter,
  ConfirmDialog,
  DataList,
  DataRow,
  IconButton,
  IconLink,
  LoadFailed,
  Spinner,
} from '@/shared/ui';
import { openContractFile } from './openContractFile';
import { useCancelContract, useContracts, useDeleteContract } from './queries';

type DialogState =
  | { kind: 'none' }
  | { kind: 'cancel'; contract: ContractDto }
  | { kind: 'delete'; contract: ContractDto };

const titleOf = (contract: ContractDto) =>
  `№ ${contract.contractNumber} від ${formatCalendarDate(contract.contractDate)}`;

/** The contract shown first: the latest valid one, or the latest of all when every one is annulled. */
function mainContract(contracts: ContractDto[]) {
  return contracts.findLast((contract) => !contract.cancellation) ?? contracts.at(-1);
}

/**
 * The «Договір» tab of the card (mock-ups of 2026-11-20): one contract at a time in its titled
 * frame beside «Додаткова угода»; with more than one, ‹ › page through them in the order made
 * (an annulled one in a red frame with «Анульовано»). ＋ opens the page of another contract.
 */
export function ContractTab({ app }: { app: ApplicationDto }) {
  const user = useCurrentUser();
  const contracts = useContracts(app.id);
  const cancel = useCancelContract(app.id);
  const remove = useDeleteContract(app.id);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  // The contract paged to; the main one until the user pages (or after it is deleted).
  const [shownId, setShownId] = useState<string | null>(null);
  const close = () => setDialog({ kind: 'none' });
  const manage = canManageDocuments(app, user);
  const canDelete = canDeleteDocument(app, user);

  const openFile = async (contract: ContractDto, kind: ContractFileKind) => {
    try {
      await openContractFile(app.id, contract, kind);
    } catch (e) {
      notifyError(toApiError(e).message);
    }
  };

  if (contracts.isPending) return <Spinner label="Завантаження договорів…" />;
  if (contracts.isError) {
    return <LoadFailed error={contracts.error} onRetry={() => contracts.refetch()} />;
  }

  const list = contracts.data;
  const main = list.find((contract) => contract.id === shownId) ?? mainContract(list);
  const position = main ? list.indexOf(main) : -1;
  const addLink = manage && (
    <IconLink icon="plus" label="Додати договір" to={`/applications/${app.id}/contracts/new`} />
  );
  /** Edit and annul a valid contract; delete for good — an admin. */
  const changeActions = (contract: ContractDto) => (
    <>
      {manage && !contract.cancellation && (
        <>
          <IconLink
            icon="pencil"
            label="Редагувати"
            to={`/applications/${app.id}/contracts/${contract.id}/edit`}
          />
          <IconButton
            icon="ban"
            label="Анулювати"
            tone="danger"
            onClick={() => setDialog({ kind: 'cancel', contract })}
          />
        </>
      )}
      {canDelete && (
        <IconButton
          icon="trash"
          label="Видалити"
          tone="danger"
          onClick={() => setDialog({ kind: 'delete', contract })}
        />
      )}
    </>
  );

  return (
    <>
      {main ? (
        <div className={clsx(styles.split, styles.splitFill)}>
          <DocumentFrame
            title="Договір"
            label={`Договір № ${main.contractNumber}`}
            cancelled={Boolean(main.cancellation)}
            footer={
              <>
                <div className={styles.frameScans}>
                  {main.document && (
                    <IconButton
                      icon="download"
                      label="Завантажити документ договору"
                      title={main.document.name}
                      onClick={() => openFile(main, 'document')}
                    />
                  )}
                  {main.scan && (
                    <IconButton
                      icon="eye"
                      label="Відкрити скан"
                      title={main.scan.name}
                      onClick={() => openFile(main, 'scan')}
                    />
                  )}
                </div>
                <div className={styles.frameFooterEnd}>
                  {list.length > 1 && (
                    <div className={styles.frameActions}>
                      <IconButton
                        icon="chevronLeft"
                        label="Попередній договір"
                        disabled={position === 0}
                        onClick={() => setShownId(list[position - 1]!.id)}
                      />
                      <IconButton
                        icon="chevronRight"
                        label="Наступний договір"
                        disabled={position === list.length - 1}
                        onClick={() => setShownId(list[position + 1]!.id)}
                      />
                    </div>
                  )}
                  <div className={styles.frameActions}>
                    {addLink}
                    {changeActions(main)}
                  </div>
                </div>
              </>
            }
          >
            {main.cancellation && (
              <span className={styles.frameBadge}>
                <Badge tone="danger">Анульовано</Badge>
              </span>
            )}
            <DataList labels="fixed">
              <DataRow label="Договір">{titleOf(main)}</DataRow>
              <DataRow label="Замовник">{main.customer}</DataRow>
              <DataRow label="Адреса">{main.address}</DataRow>
              <DataRow label="Дата укладання">
                {main.signedDate && formatCalendarDate(main.signedDate)}
              </DataRow>
              <DataRow label="Представник замовника">{main.representative}</DataRow>
              {main.comment && <DataRow label="Коментар">{main.comment}</DataRow>}
            </DataList>
            {main.cancellation && <CancellationNote cancellation={main.cancellation} />}
          </DocumentFrame>
          {/* A place for the additional agreements, coming in a later stage (agreed 2026-11-20). */}
          <DocumentFrame title="Додаткова угода">
            <div className={styles.frameEmpty}>
              {manage ? (
                <Button disabled title="Додаткові угоди з’являться згодом">
                  Додати додаткову угоду
                </Button>
              ) : (
                <p className={styles.muted}>Додаткових угод немає.</p>
              )}
            </div>
          </DocumentFrame>
        </div>
      ) : (
        <p className={styles.muted}>Договорів ще немає.</p>
      )}

      {!main && <CardFooter actions={addLink} />}

      {dialog.kind === 'cancel' && (
        <CancelDocumentDialog
          title={`Анулювати договір № ${dialog.contract.contractNumber}?`}
          confirmLabel="Анулювати договір"
          note="Договір лишиться в картці з позначкою «Анульовано» і причиною; його номер не використовуватиметься повторно."
          onClose={close}
          onConfirm={async (reason) => {
            await cancel.mutateAsync({
              id: dialog.contract.id,
              input: { reason, version: dialog.contract.version },
            });
            notifySuccess(`Договір № ${dialog.contract.contractNumber} анульовано`);
          }}
        />
      )}
      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          danger
          title={`Видалити договір № ${dialog.contract.contractNumber}?`}
          confirmLabel="Видалити"
          loading={remove.isPending}
          onCancel={close}
          onConfirm={async () => {
            const { contract } = dialog;
            try {
              await remove.mutateAsync({ id: contract.id, version: contract.version });
              close();
              notifySuccess(`Договір № ${contract.contractNumber} видалено`);
            } catch (e) {
              notifyError(toApiError(e).message);
            }
          }}
        >
          <p>Договір, його документ і скан буде видалено назавжди. Цю дію не можна скасувати.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
