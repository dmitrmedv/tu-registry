import type { ScanDto } from '@tu-registry/shared';
import { useState } from 'react';
import { ScanDropzone } from '@/features/applications';
import { toApiError } from '@/shared/api/apiError';
import { notifyError, notifySuccess } from '@/shared/lib/notify';
import { openPdf } from '@/shared/lib/pdf';
import { ConfirmDialog } from '@/shared/ui';

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
 * scan is immediate, after confirming, and said by a notification (it shows over the dialog).
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

  const view = async () => {
    if (!scan) return;
    try {
      await openPdf(load, scan.name);
    } catch (failure) {
      notifyError(toApiError(failure).message);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await onRemove();
      setConfirming(false);
      notifySuccess('Скан видалено');
    } catch (failure) {
      notifyError(toApiError(failure).message);
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
                onRemove: () => setConfirming(true),
              }
            : undefined
        }
        disabled={disabled}
      />
      {confirming && scan && (
        <ConfirmDialog
          open
          danger
          title="Видалити скан?"
          confirmLabel="Видалити"
          loading={removing}
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
