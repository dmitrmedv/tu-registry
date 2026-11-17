import type { ScanDto } from '@tu-registry/shared';
import { useState } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { openPdf } from '@/shared/lib/pdf';
import { Alert, ConfirmDialog, IconButton } from '@/shared/ui';
import styles from './documents.module.scss';

type Props = {
  /** None: nothing to show, or «Скан видалено» right after removing it. */
  scan: ScanDto | null;
  /** Whose scan it is, for the confirmation: «відповіді № 125». */
  owner: string;
  load: () => Promise<Blob>;
  /** Removes the file for good (agreed 2026-11-17); the scans it replaced stay. */
  onRemove: () => Promise<unknown>;
  disabled?: boolean;
};

/**
 * The current scan in a document's edit dialog: open it, or remove a wrong file. The dialog
 * stays open, so the outcome is an `Alert` in it: its backdrop would cover a notification.
 */
export function CurrentScan({ scan, owner, load, onRemove, disabled = false }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string>();
  const [removed, setRemoved] = useState(false);

  const view = async () => {
    if (!scan) return;
    setError(undefined);
    try {
      await openPdf(load, scan.name);
    } catch (failure) {
      setError(toApiError(failure).message);
    }
  };

  const remove = async () => {
    setError(undefined);
    setRemoving(true);
    try {
      await onRemove();
      setConfirming(false);
      setRemoved(true);
    } catch (failure) {
      setError(toApiError(failure).message);
    } finally {
      setRemoving(false);
    }
  };

  if (!scan) return removed ? <Alert variant="success">Скан видалено</Alert> : null;

  return (
    <>
      <div className={styles.currentScan}>
        <p className={styles.currentScanName}>
          <span className="visually-hidden">Поточний скан: </span>
          {scan.name}
        </p>
        <IconButton icon="eye" label="Переглянути скан" disabled={disabled} onClick={view} />
        <IconButton
          icon="trash"
          label="Видалити скан"
          tone="danger"
          disabled={disabled}
          onClick={() => {
            setError(undefined);
            setConfirming(true);
          }}
        />
      </div>
      {error && !confirming && <Alert variant="error">{error}</Alert>}
      {confirming && (
        <ConfirmDialog
          open
          danger
          title="Видалити скан?"
          confirmLabel="Видалити"
          loading={removing}
          error={error}
          onCancel={() => setConfirming(false)}
          onConfirm={remove}
        >
          <p>
            Файл «{scan.name}» буде видалено з {owner} назавжди. Попередні скани лишаться в історії,
            запис про видалення — в журналі змін.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
