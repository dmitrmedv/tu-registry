import { useState } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { notifyError } from '@/shared/lib/notify';

/** What «Зберегти» does to the scan on an edit page (agreed 2026-11-17: nothing happens before). */
export type ScanChange = { kind: 'keep' } | { kind: 'replace'; file: File } | { kind: 'remove' };

const KEEP: ScanChange = { kind: 'keep' };

type Actions = {
  upload: (file: File, onProgress?: (percent: number) => void) => Promise<unknown>;
  remove: () => Promise<unknown>;
};

/** The scan change chosen on an edit page, applied by its form after the fields are saved. */
export function useScanChange(actions: Actions) {
  const [change, setChange] = useState<ScanChange>(KEEP);
  const [progress, setProgress] = useState<number | null>(null);

  /** Throws when it fails, after saying why in a notification. */
  const apply = async () => {
    if (change.kind === 'keep') return;
    try {
      if (change.kind === 'replace') {
        setProgress(0);
        await actions.upload(change.file, setProgress);
      } else {
        await actions.remove();
      }
      setChange(KEEP);
    } catch (failure) {
      const action = change.kind === 'remove' ? 'видалено' : 'завантажено';
      notifyError(`Скан не ${action}: ${toApiError(failure).message}`);
      throw failure;
    } finally {
      setProgress(null);
    }
  };

  return {
    change,
    choose: setChange,
    keep: () => setChange(KEEP),
    changed: change.kind !== 'keep',
    progress,
    apply,
  };
}

export type ScanChangeState = ReturnType<typeof useScanChange>;

/** The notification after saving only the scan. */
export function scanChangeMessage(change: ScanChange, hadScan: boolean) {
  if (change.kind === 'remove') return 'Скан видалено';
  return hadScan ? 'Скан замінено' : 'Скан додано';
}
