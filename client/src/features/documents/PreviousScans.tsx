import { formatFileSize, type PreviousScanDto } from '@tu-registry/shared';
import { formatDateTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui';
import styles from './documents.module.scss';

type Props = {
  scans: PreviousScanDto[];
  onOpen: (scan: PreviousScanDto) => void;
};

/** Scans replaced earlier: kept as part of the processing, folded away under the document. */
export function PreviousScans({ scans, onOpen }: Props) {
  if (scans.length === 0) return null;
  return (
    <details className={styles.previous}>
      <summary>Попередні версії скану ({scans.length})</summary>
      <ul>
        {scans.map((scan) => (
          <li key={scan.id}>
            <Button size="sm" variant="ghost" onClick={() => onOpen(scan)}>
              {scan.name}
            </Button>{' '}
            <span className={styles.muted}>
              {formatFileSize(scan.size)}, {formatDateTime(scan.uploadedAt)},{' '}
              {scan.uploadedBy.fullName}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
