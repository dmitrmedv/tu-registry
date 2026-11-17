import type { PreviousScanDto } from '@tu-registry/shared';
import type { ReactNode } from 'react';
import { formatDateTime } from '@/shared/lib/format';
import { Button, CardItems, Icon } from '@/shared/ui';
import styles from './documents.module.scss';
import { PreviousScans } from './PreviousScans';

type Person = { fullName: string };

/** «Відкрити скан»: the labelled main action of a tab, in its bottom left corner. */
export function ScanButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <Button onClick={onClick} title={title}>
      Відкрити скан <Icon name="eye" />
    </Button>
  );
}

/**
 * Who cancelled the document, when and why, a line each (the frame of a cancelled response,
 * agreed 2026-11-17). The hidden words give the lines their meaning for screen readers.
 */
export function CancellationNote({
  cancellation,
}: {
  cancellation: { reason: string; at: string; by: Person };
}) {
  return (
    <p className={styles.cancellationNote}>
      <span className="visually-hidden">Скасував: </span>
      {cancellation.by.fullName}
      <br />
      <span className="visually-hidden">Коли: </span>
      {formatDateTime(cancellation.at)}
      <br />
      <span className="visually-hidden">Причина: </span>
      {cancellation.reason}
    </p>
  );
}

/** Who cancelled the document and why; the scans it replaced. */
export function DocumentNotes({
  cancellation,
  previousScans,
  onOpenScan,
}: {
  cancellation: { reason: string; at: string; by: Person } | null;
  previousScans: PreviousScanDto[];
  onOpenScan: (scan: PreviousScanDto) => void;
}) {
  return (
    <>
      {cancellation && (
        <p className={styles.muted}>
          Скасовано {formatDateTime(cancellation.at)}, {cancellation.by.fullName}:{' '}
          {cancellation.reason}
        </p>
      )}
      <PreviousScans scans={previousScans} onOpen={onOpenScan} />
    </>
  );
}

/** The module's documents other than the current one (earlier and cancelled), folded away. */
export function OtherDocuments({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <details className={styles.others}>
      <summary>
        {title} ({count})
      </summary>
      <CardItems>{children}</CardItems>
    </details>
  );
}
