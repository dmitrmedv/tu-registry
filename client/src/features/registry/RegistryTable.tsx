import {
  type ApplicationListItemDto,
  type ApplicationSort,
  type SortField,
} from '@tu-registry/shared';
import clsx from 'clsx';
import { type MouseEvent, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useDepartments } from '@/features/departments';
import { Badge, type ColumnWidths, DataTable, type DataTableColumn } from '@/shared/ui';
import type { RegistryColumn } from './registryColumns';
import styles from './registry.module.scss';

type Row = ApplicationListItemDto;

type Props = {
  rows: Row[];
  /** The columns after «№», as the viewer chose them (see useRegistryColumns). */
  columns: RegistryColumn[];
  sort: ApplicationSort;
  onSort: (sort: ApplicationSort) => void;
  widths: ColumnWidths;
  onWidthsChange: (widths: ColumnWidths) => void;
  onColumnMove: (id: RegistryColumn['id'], targetId: RegistryColumn['id']) => void;
};

/** Number and dates start from the newest; names start from А. A second click reverses. */
const NEWEST_FIRST: SortField[] = ['regNumber', 'regDate', 'lastResponseDate', 'tuDate'];

/** The header button and aria-sort of a column sorted on the server. */
function sortable(
  field: SortField,
  label: string,
  { sort, onSort }: Pick<Props, 'sort' | 'onSort'>,
): Pick<DataTableColumn<Row>, 'header' | 'headerProps'> {
  const direction = sort === field ? 'ascending' : sort === `-${field}` ? 'descending' : undefined;
  const firstClick: ApplicationSort = NEWEST_FIRST.includes(field) ? `-${field}` : field;
  const next: ApplicationSort =
    direction === undefined ? firstClick : direction === 'ascending' ? `-${field}` : field;
  return {
    headerProps: { 'aria-sort': direction ?? 'none' },
    header: (
      <button type="button" className={styles.sortButton} onClick={() => onSort(next)}>
        {label}
        <span aria-hidden="true" className={styles.sortIcon}>
          {direction === 'ascending' ? '▲' : direction === 'descending' ? '▼' : '↕'}
        </span>
      </button>
    ),
  };
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

export function RegistryTable({
  rows,
  columns,
  sort,
  onSort,
  widths,
  onWidthsChange,
  onColumnMove,
}: Props) {
  // The card's "back to registry" link returns to exactly these filters.
  const { search } = useLocation();
  const openRow = useRowOpener(search);
  const { nameOf } = useDepartments();

  const tableColumns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        id: 'regNumber',
        label: '№',
        size: 130,
        minSize: 90,
        // «Анульовано» goes under the number rather than widening the column.
        wrap: true,
        // The row's link: always first.
        fixed: true,
        ...sortable('regNumber', '№', { sort, onSort }),
        cell: (row) => (
          <>
            <Link
              to={`/applications/${row.id}`}
              state={{ registrySearch: search }}
              className={styles.rowLink}
            >
              {row.regNumber}
            </Link>
            {row.status === 'ANNULLED' && (
              <>
                {' '}
                <Badge tone="danger">Анульовано</Badge>
              </>
            )}
          </>
        ),
      },
      ...columns.map((column) => ({
        id: column.id,
        label: column.label,
        size: column.size,
        wrap: column.wrap,
        ...sortable(column.id, column.label, { sort, onSort }),
        cell: (row: Row) => column.cell(row, nameOf),
      })),
    ],
    [columns, sort, onSort, search, nameOf],
  );

  return (
    <DataTable
      caption="Реєстр заяв"
      rows={rows}
      columns={tableColumns}
      getRowId={(row) => row.id}
      widths={widths}
      onWidthsChange={onWidthsChange}
      // Only the columns after «№» move, and those ids are RegistryColumn ids.
      onColumnMove={(id, targetId) =>
        onColumnMove(id as RegistryColumn['id'], targetId as RegistryColumn['id'])
      }
      rowProps={(row) => ({
        className: clsx(styles.row, row.status === 'ANNULLED' && styles.annulledRow),
        onClick: (event) => openRow(event, `/applications/${row.id}`),
        onAuxClick: (event) => openRow(event, `/applications/${row.id}`),
      })}
    />
  );
}
