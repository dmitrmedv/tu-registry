import type { AuditLogDto } from '@tu-registry/shared';
import { Link } from 'react-router';
import { formatDateTime } from '@/shared/lib/format';
import { AUDIT_ACTION_LABELS } from '@/shared/lib/labels';
import { Table } from '@/shared/ui';
import styles from './audit.module.scss';
import { describeDetails } from './describeDetails';

function EntityCell({ entry }: { entry: AuditLogDto }) {
  if (!entry.entityId || !entry.entityLabel) return <>—</>;
  if (entry.entityType === 'Application') {
    return <Link to={`/applications/${entry.entityId}`}>Заява {entry.entityLabel}</Link>;
  }
  return <code>{entry.entityLabel}</code>;
}

export function AuditTable({ rows }: { rows: AuditLogDto[] }) {
  return (
    <Table caption="Журнал аудиту">
      <thead>
        <tr>
          <th scope="col">Час</th>
          <th scope="col">Користувач</th>
          <th scope="col">Дія</th>
          <th scope="col">Обʼєкт</th>
          <th scope="col">Деталі</th>
          <th scope="col">IP</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((entry) => (
          <tr key={entry.id}>
            <td className={styles.nowrap}>
              <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
            </td>
            <td>{entry.actor?.fullName ?? '—'}</td>
            <td>{AUDIT_ACTION_LABELS[entry.action]}</td>
            <td>
              <EntityCell entry={entry} />
            </td>
            <td>{describeDetails(entry) || '—'}</td>
            <td>
              <code>{entry.ip ?? '—'}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
