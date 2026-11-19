import type { ScanDto } from '@tu-registry/shared';
import { useState } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { Alert } from '@/shared/ui';
import { ScanDropzone } from './ScanDropzone';
import styles from './ScanDropzone.module.scss';
import type { ScanChangeState } from './useScanChange';

type Props = {
  title: string;
  /** The stored scan. */
  scan: ScanDto | null;
  /** The change chosen here; the form's «Зберегти» applies it. */
  scanChange: ScanChangeState;
  onView: () => Promise<void>;
  disabled?: boolean;
  className?: string;
};

/**
 * The stored scan on an edit page or in a dialog, in the common zone (`ScanDropzone`): replacing
 * or removing it is only chosen here; nothing changes until «Зберегти» (agreed 2026-11-17).
 */
export function ScanPanel({ title, scan, scanChange, onView, disabled = false, className }: Props) {
  const [viewError, setViewError] = useState<string>();
  const { change, choose, keep, progress, error } = scanChange;
  const busy = disabled || progress !== null;

  const view = async () => {
    setViewError(undefined);
    try {
      await onView();
    } catch (failure) {
      setViewError(toApiError(failure).message);
    }
  };

  return (
    <div className={className}>
      <ScanDropzone
        title={title}
        file={change.kind === 'replace' ? change.file : null}
        onChange={(file) => (file ? choose({ kind: 'replace', file }) : keep())}
        current={
          scan && change.kind === 'keep'
            ? { onView: view, onRemove: () => choose({ kind: 'remove' }) }
            : undefined
        }
        removal={scan && change.kind === 'remove' ? { onUndo: keep } : undefined}
        disabled={busy}
      >
        {progress !== null && (
          <p role="status" className={styles.limits}>
            Завантаження скану… {progress}%
          </p>
        )}
        {(error ?? viewError) && <Alert variant="error">{error ?? viewError}</Alert>}
      </ScanDropzone>
    </div>
  );
}
