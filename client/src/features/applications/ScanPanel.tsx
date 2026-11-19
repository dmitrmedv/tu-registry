import { formatFileSize, type ScanDto } from '@tu-registry/shared';
import clsx from 'clsx';
import { type ReactNode, useId, useState } from 'react';
import { toApiError } from '@/shared/api/apiError';
import { formatDateTime } from '@/shared/lib/format';
import { Alert, Button, Icon, IconButton } from '@/shared/ui';
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
  /** In a dialog's grid: no frame of its own, the title centred, «no scan» inside the zone. */
  compact?: boolean;
  className?: string;
};

/**
 * The scan on an edit page: what is stored, opening it, and choosing to replace or remove it.
 * Nothing changes until «Зберегти» (agreed 2026-11-17).
 */
export function ScanPanel({
  title,
  scan,
  scanChange,
  onView,
  disabled = false,
  compact = false,
  className,
}: Props) {
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

  const viewButton = (
    <Button size="sm" onClick={view}>
      <Icon name="eye" />
      Переглянути
    </Button>
  );
  const removeButton = (
    <Button size="sm" disabled={busy} onClick={() => choose({ kind: 'remove' })}>
      <Icon name="trash" />
      Видалити скан
    </Button>
  );
  // In the dialog only that a scan is there, without its file name, author and time; a removal
  // waits in the same zone, so the grid keeps its shape (2026-11-19).
  const stored = scan !== null && change.kind === 'keep';
  const removing = scan !== null && change.kind === 'remove';
  let added: ReactNode;
  if (compact && removing) {
    added = (
      <>
        <p className={styles.removing}>Скан буде видалено після збереження.</p>
        <Button size="sm" disabled={busy} onClick={keep}>
          Не видаляти
        </Button>
      </>
    );
  } else if (compact && (stored || change.kind === 'replace')) {
    added = (
      <>
        <p className={styles.added}>
          <Icon name="check" />
          Скан додано
        </p>
        <div className={styles.iconActions}>
          {stored ? (
            <>
              <IconButton icon="eye" label="Переглянути скан" onClick={view} />
              <IconButton
                icon="trash"
                label="Видалити скан"
                tone="danger"
                disabled={busy}
                onClick={() => choose({ kind: 'remove' })}
              />
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={keep}>
              Прибрати
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <section
      className={clsx(compact ? styles.compact : styles.panel, className)}
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {scan && !compact ? (
        <div className={styles.current}>
          <p className={styles.name}>{scan.name}</p>
          <p className={styles.meta}>
            {formatFileSize(scan.size)} · {scan.uploadedBy.fullName},{' '}
            {formatDateTime(scan.uploadedAt)}
          </p>
          <div className={styles.actions}>
            {viewButton}
            {change.kind !== 'remove' && removeButton}
          </div>
        </div>
      ) : (
        !compact && <p className={styles.meta}>Скан не додано.</p>
      )}
      {removing && !compact && (
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
        note={compact ? 'Скан не додано.' : undefined}
        added={added}
        disabled={busy}
      />
      {change.kind === 'replace' && !compact && (
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
