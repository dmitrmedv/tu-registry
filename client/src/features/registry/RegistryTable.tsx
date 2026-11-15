import type { ApplicationListItemDto, ApplicationSort } from '@tu-registry/shared';
import { formatCalendarDate } from '@/shared/lib/format';
import { OBJECT_TYPE_LABELS } from '@/shared/lib/labels';
import { Badge, Table } from '@/shared/ui';
import styles from './registry.module.scss';

type SortField = 'regNumber' | 'regDate';

type Props = {
  rows: ApplicationListItemDto[];
  sort: ApplicationSort;
  onSort: (sort: ApplicationSort) => void;
};

function SortableHeader({
  field,
  label,
  sort,
  onSort,
}: { field: SortField; label: string } & Pick<Props, 'sort' | 'onSort'>) {
  const direction = sort === field ? 'ascending' : sort === `-${field}` ? 'descending' : undefined;
  // First click sorts newest/highest first; the next click reverses.
  const next: ApplicationSort = direction === 'descending' ? field : `-${field}`;
  return (
    <th scope="col" aria-sort={direction ?? 'none'}>
      <button type="button" className={styles.sortButton} onClick={() => onSort(next)}>
        {label}
        <span aria-hidden="true" className={styles.sortIcon}>
          {direction === 'ascending' ? '▲' : direction === 'descending' ? '▼' : '↕'}
        </span>
      </button>
    </th>
  );
}

export function RegistryTable({ rows, sort, onSort }: Props) {
  return (
    <Table caption="Реєстр заяв">
      <thead>
        <tr>
          <SortableHeader field="regNumber" label="№" sort={sort} onSort={onSort} />
          <SortableHeader field="regDate" label="Дата реєстрації" sort={sort} onSort={onSort} />
          <th scope="col">Замовник</th>
          <th scope="col">Представник замовника</th>
          <th scope="col">Адреса</th>
          <th scope="col">Тип обʼєкта</th>
          <th scope="col">Зареєстрував</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className={styles.nowrap}>
              <strong>{row.regNumber}</strong>
              {row.registrationMode === 'MANUAL' && (
                <>
                  {' '}
                  <Badge>вручну</Badge>
                </>
              )}
            </td>
            <td className={styles.nowrap}>{formatCalendarDate(row.regDate)}</td>
            <td className={styles.wrap}>{row.customer}</td>
            <td className={styles.wrap}>{row.customerRepresentative ?? '—'}</td>
            <td className={styles.wrap}>{row.objectAddress}</td>
            <td className={styles.nowrap}>{OBJECT_TYPE_LABELS[row.objectType]}</td>
            <td className={styles.nowrap}>{row.createdBy.fullName}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
