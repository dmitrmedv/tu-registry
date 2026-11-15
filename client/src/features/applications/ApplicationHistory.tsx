import type { ApplicationChangeDto } from '@tu-registry/shared';
import { useDepartments } from '@/features/departments';
import { toApiError } from '@/shared/api/apiError';
import { formatDateTime } from '@/shared/lib/format';
import {
  APPLICATION_FIELD_LABELS,
  CHANGE_ACTION_LABELS,
  formatFieldValue,
} from '@/shared/lib/labels';
import { Alert, Spinner } from '@/shared/ui';
import styles from './ApplicationDetails.module.scss';
import { useApplicationHistory } from './queries';

function Entry({ entry }: { entry: ApplicationChangeDto }) {
  const { nameOf } = useDepartments();
  return (
    <li className={styles.entry}>
      <div className={styles.entryHeader}>
        <strong>{CHANGE_ACTION_LABELS[entry.action]}</strong>
        <time dateTime={entry.changedAt}>{formatDateTime(entry.changedAt)}</time>
        <span>{entry.changedBy.fullName}</span>
      </div>
      {entry.changes.length > 0 && (
        <ul>
          {entry.changes.map((change) => (
            <li key={change.field}>
              {APPLICATION_FIELD_LABELS[change.field] ?? change.field}:{' '}
              {change.oldValue !== null && (
                <>
                  <span className={styles.oldValue}>
                    {formatFieldValue(change.field, change.oldValue, nameOf)}
                  </span>{' '}
                  →{' '}
                </>
              )}
              {formatFieldValue(change.field, change.newValue, nameOf)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Every saved change of the application, newest first. */
export function ApplicationHistory({ applicationId }: { applicationId: string }) {
  const history = useApplicationHistory(applicationId);
  if (history.isPending) return <Spinner label="Завантаження історії…" />;
  if (history.isError) return <Alert variant="error">{toApiError(history.error).message}</Alert>;
  return (
    <ol className={styles.history} aria-label="Історія змін">
      {history.data.map((entry) => (
        <Entry key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}
