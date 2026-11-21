import type { ApplicationChangeDto } from '@tu-registry/shared';
import { useDepartments } from '@/features/departments';
import { formatDateTime } from '@/shared/lib/format';
import {
  APPLICATION_FIELD_LABELS,
  CHANGE_ACTION_LABELS,
  describeDocumentChange,
  DOCUMENT_CHANGE_ACTION_LABELS,
  formatFieldValue,
  HISTORY_DOCUMENT_LABELS,
} from '@/shared/lib/labels';
import { LoadFailed, Spinner } from '@/shared/ui';
import styles from './ApplicationDetails.module.scss';
import { useApplicationHistory } from './queries';

/** A change of one of the application's documents: «Відповідь № 126/01 — змінено». */
function DocumentEntry({
  entry,
  document,
}: {
  entry: ApplicationChangeDto;
  document: NonNullable<ApplicationChangeDto['document']>;
}) {
  const { nameOf } = useDepartments();
  return (
    <li className={styles.entry}>
      <div className={styles.entryHeader}>
        <strong>
          {HISTORY_DOCUMENT_LABELS[document.kind]} № {document.number} —{' '}
          {DOCUMENT_CHANGE_ACTION_LABELS[entry.action]}
        </strong>
        <time dateTime={entry.changedAt}>{formatDateTime(entry.changedAt)}</time>
        <span>{entry.changedBy.fullName}</span>
      </div>
      {entry.changes.length > 0 && (
        <ul>
          {entry.changes.map((change) => {
            const shown = describeDocumentChange(document.kind, change, nameOf);
            return (
              <li key={change.field}>
                {shown.label}:{' '}
                {shown.oldValue !== null && (
                  <>
                    <span className={styles.oldValue}>{shown.oldValue}</span> →{' '}
                  </>
                )}
                {shown.newValue}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function Entry({ entry }: { entry: ApplicationChangeDto }) {
  const { nameOf } = useDepartments();
  if (entry.document) return <DocumentEntry entry={entry} document={entry.document} />;
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

/** Every saved change of the application and of its documents, newest first. */
export function ApplicationHistory({ applicationId }: { applicationId: string }) {
  const history = useApplicationHistory(applicationId);
  if (history.isPending) return <Spinner label="Завантаження історії…" />;
  if (history.isError) {
    return <LoadFailed error={history.error} onRetry={() => history.refetch()} />;
  }
  return (
    <ol className={styles.history} aria-label="Історія змін">
      {history.data.map((entry) => (
        <Entry key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}
