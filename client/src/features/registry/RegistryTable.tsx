import type { ApplicationListItemDto, ApplicationSort } from '@tu-registry/shared';
import clsx from 'clsx';
import type { MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { formatCalendarDate } from '@/shared/lib/format';
import { formatObjectAddress, formatObjectCategory, OBJECT_TYPE_LABELS } from '@/shared/lib/labels';
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

/**
 * A click anywhere on a row opens the card; Ctrl/Cmd+click and the middle button open it in a
 * new tab. Mouse only: keyboard and screen-reader users get the link on the number. Clicks on
 * that link, and clicks that end a text selection, are left alone.
 */
function useRowOpener(registrySearch: string) {
  const navigate = useNavigate();
  return (event: MouseEvent<HTMLTableRowElement>, to: string) => {
    if ((event.target as HTMLElement).closest('a, button')) return;
    if (window.getSelection()?.toString()) return;
    if (event.button === 1 || event.metaKey || event.ctrlKey) {
      window.open(to, '_blank', 'noopener');
      return;
    }
    if (event.button === 0) navigate(to, { state: { registrySearch } });
  };
}

export function RegistryTable({ rows, sort, onSort }: Props) {
  // The card's "back to registry" link returns to exactly these filters.
  const { search } = useLocation();
  const openRow = useRowOpener(search);
  return (
    <Table caption="Реєстр заяв">
      <thead>
        <tr>
          <SortableHeader field="regNumber" label="№" sort={sort} onSort={onSort} />
          <SortableHeader field="regDate" label="Дата реєстрації" sort={sort} onSort={onSort} />
          <th scope="col">Замовник</th>
          <th scope="col">Населений пункт</th>
          <th scope="col">Адреса</th>
          <th scope="col">Тип обʼєкта</th>
          <th scope="col">Категорія</th>
          <th scope="col">Представник замовника</th>
          <th scope="col">Зареєстрував</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className={clsx(styles.row, row.status === 'ANNULLED' && styles.annulledRow)}
            onClick={(event) => openRow(event, `/applications/${row.id}`)}
            onAuxClick={(event) => openRow(event, `/applications/${row.id}`)}
          >
            <td className={styles.nowrap}>
              <Link
                to={`/applications/${row.id}`}
                state={{ registrySearch: search }}
                className={styles.rowLink}
              >
                {row.regNumber}
              </Link>
              {row.registrationMode === 'MANUAL' && (
                <>
                  {' '}
                  <Badge>вручну</Badge>
                </>
              )}
              {row.status === 'ANNULLED' && (
                <>
                  {' '}
                  <Badge tone="danger">Анульовано</Badge>
                </>
              )}
            </td>
            <td className={styles.nowrap}>{formatCalendarDate(row.regDate)}</td>
            <td className={styles.wrap}>{row.customer}</td>
            <td className={styles.nowrap}>{row.settlement ?? '—'}</td>
            <td className={styles.wrap}>
              {formatObjectAddress(row.objectAddress, row.cadastralNumber)}
            </td>
            <td className={styles.nowrap}>{OBJECT_TYPE_LABELS[row.objectType]}</td>
            <td className={styles.wrap}>
              {formatObjectCategory(row.objectCategory, row.objectCategoryOther)}
            </td>
            <td className={styles.wrap}>{row.customerRepresentative ?? '—'}</td>
            <td className={styles.nowrap}>{row.createdBy.fullName}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
