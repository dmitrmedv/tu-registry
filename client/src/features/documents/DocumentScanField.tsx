import type { ScanDto } from '@tu-registry/shared';
import { useState } from 'react';
import { ScanDropzone } from '@/features/applications';
import { toApiError } from '@/shared/api/apiError';
import { openPdf } from '@/shared/lib/pdf';
import { Alert, ConfirmDialog } from '@/shared/ui';

type Props = {
  title: string;
  /** The stored scan, if any. */
  scan: ScanDto | null;
  /** Whose scan it is, for the confirmation: «відповіді № 125». */
  owner: string;
  /** A new file, sent on «Зберегти»; it replaces the stored one, which stays in the history. */
  file: File | null;
  onChange: (file: File | null) => void;
  load: () => Promise<Blob>;
  /** Removes the file for good (agreed 2026-11-17); the scans it replaced stay. */
  onRemove: () => Promise<unknown>;
  disabled?: boolean;
};

/**
 * A document's scan in its dialog, in the common zone (`ScanDropzone`). Removing the stored
 * scan is immediate, after confirming; the dialog stays open, so the outcome is an `Alert` in
 * it: its backdrop would cover a notification.
 */
export function DocumentScanField({
  title,
  scan,
  owner,
  file,
  onChange,
  load,
  onRemove,
  disabled = false,
}: Props) {
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

  return (
    <>
      <ScanDropzone
        title={title}
        file={file}
        onChange={onChange}
        current={
          scan
            ? {
                onView: view,
                onRemove: () => {
                  setError(undefined);
                  setConfirming(true);
                },
              }
            : undefined
        }
        disabled={disabled}
      >
        {removed && !scan && <Alert variant="success">Скан видалено</Alert>}
        {error && !confirming && <Alert variant="error">{error}</Alert>}
      </ScanDropzone>
      {confirming && scan && (
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
