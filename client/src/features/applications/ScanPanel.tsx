import { formatFileSize, type ScanDto } from '@tu-registry/shared';
import { useId, useState } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { formatDateTime } from '@/shared/lib/format';
import { Alert, Button, Icon } from '@/shared/ui';
import { ScanDropzone } from './ScanDropzone';
import styles from './ScanPanel.module.scss';
import type { ScanChangeState } from './useScanChange';

type Props = {
  title: string;
  /** The stored scan. */
  scan: ScanDto | null;
  /** The change chosen here; the page's «Зберегти» applies it. */
  scanChange: ScanChangeState;
  onView: () => Promise<void>;
  disabled?: boolean;
};

/**
 * The scan on an edit page: what is stored, opening it, and choosing to replace or remove it.
 * Nothing changes until «Зберегти» (agreed 2026-11-17).
 */
export function ScanPanel({ title, scan, scanChange, onView, disabled = false }: Props) {
  const titleId = useId();
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
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {scan ? (
        <div className={styles.current}>
          <p className={styles.name}>{scan.name}</p>
          <p className={styles.meta}>
            {formatFileSize(scan.size)} · {scan.uploadedBy.fullName},{' '}
            {formatDateTime(scan.uploadedAt)}
          </p>
          <div className={styles.actions}>
            <Button size="sm" onClick={view}>
              <Icon name="eye" />
              Переглянути
            </Button>
            {change.kind !== 'remove' && (
              <Button size="sm" disabled={busy} onClick={() => choose({ kind: 'remove' })}>
                <Icon name="trash" />
                Видалити скан
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className={styles.meta}>Скан не додано.</p>
      )}
      {change.kind === 'remove' && scan && (
        <Alert variant="warning">
          <div className={styles.pending}>
            <span>Скан буде видалено після збереження.</span>
            <Button size="sm" disabled={busy} onClick={keep}>
              Не видаляти
            </Button>
          </div>
        </Alert>
      )}
      <ScanDropzone
        file={change.kind === 'replace' ? change.file : null}
        onChange={(file) => (file ? choose({ kind: 'replace', file }) : keep())}
        chooseLabel={scan ? 'Замінити файл' : 'Обрати файл'}
        disabled={busy}
      />
      {change.kind === 'replace' && (
        <p className={styles.meta}>
          {scan
            ? 'Новий файл замінить скан після збереження.'
            : 'Файл буде додано після збереження.'}
        </p>
      )}
      {progress !== null && (
        <p role="status" className={styles.meta}>
          Завантаження скану… {progress}%
        </p>
      )}
      {(error ?? viewError) && <Alert variant="error">{error ?? viewError}</Alert>}
    </section>
  );
}
