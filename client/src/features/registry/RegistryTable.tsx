import {
  type ApplicationListItemDto,
  type ApplicationSort,
  type SortField,
} from '@tu-registry/shared';
import clsx from 'clsx';
import type { MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useDepartments } from '@/features/departments';
import { formatCalendarDate } from '@/shared/lib/format';
import { AREA_TYPE_LABELS, formatObjectCategory, OBJECT_TYPE_LABELS } from '@/shared/lib/labels';
import { Badge, Table } from '@/shared/ui';
import styles from './registry.module.scss';

type Props = {
  rows: ApplicationListItemDto[];
  /** Admins see every department, so the column tells them apart. */
  showDepartment: boolean;
  sort: ApplicationSort;
  onSort: (sort: ApplicationSort) => void;
};

/** Number and date start from the newest; names start from А. A second click reverses. */
const NEWEST_FIRST: SortField[] = ['regNumber', 'regDate'];

function SortableHeader({
  field,
  label,
  sort,
  onSort,
}: { field: SortField; label: string } & Pick<Props, 'sort' | 'onSort'>) {
  const direction = sort === field ? 'ascending' : sort === `-${field}` ? 'descending' : undefined;
  const firstClick: ApplicationSort = NEWEST_FIRST.includes(field) ? `-${field}` : field;
  const next: ApplicationSort =
    direction === undefined ? firstClick : direction === 'ascending' ? `-${field}` : field;
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

const COLUMNS: [SortField, string][] = [
  ['customer', 'Замовник'],
  ['settlement', 'Населений пункт'],
  ['areaType', 'Місцевість'],
  ['objectAddress', 'Адреса'],
  ['objectType', 'Тип обʼєкта'],
  ['objectCategory', 'Категорія'],
  ['customerRepresentative', 'Представник замовника'],
  ['createdBy', 'Зареєстрував'],
];

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

export function RegistryTable({ rows, showDepartment, sort, onSort }: Props) {
  // The card's "back to registry" link returns to exactly these filters.
  const { search } = useLocation();
  const openRow = useRowOpener(search);
  const { nameOf } = useDepartments();
  return (
    <Table caption="Реєстр заяв">
      <thead>
        <tr>
          <SortableHeader field="regNumber" label="№" sort={sort} onSort={onSort} />
          <SortableHeader field="regDate" label="Дата реєстрації" sort={sort} onSort={onSort} />
          {showDepartment && (
            <SortableHeader field="department" label="Управління" sort={sort} onSort={onSort} />
          )}
          {COLUMNS.map(([field, label]) => (
            <SortableHeader key={field} field={field} label={label} sort={sort} onSort={onSort} />
          ))}
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
            {showDepartment && <td className={styles.nowrap}>{nameOf(row.department)}</td>}
            <td className={styles.wrap}>{row.customer}</td>
            <td className={styles.nowrap}>{row.settlement ?? '—'}</td>
            <td className={styles.nowrap}>{row.areaType ? AREA_TYPE_LABELS[row.areaType] : '—'}</td>
            <td className={styles.wrap}>{row.objectAddress}</td>
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
