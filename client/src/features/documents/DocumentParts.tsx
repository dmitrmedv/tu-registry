import type { PreviousScanDto } from '@tu-registry/shared';
import { formatDateTime } from '@/shared/lib/format';
import { IconButton } from '@/shared/ui';
import styles from './documents.module.scss';
import { PreviousScans } from './PreviousScans';

type Person = { fullName: string };

/** «Відкрити скан»: an eye in a tab's bottom left corner (icons only, agreed 2026-11-20). */
export function ScanButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <IconButton
      icon="eye"
      label="Відкрити скан"
      title={`Відкрити скан: ${title}`}
      onClick={onClick}
    />
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
