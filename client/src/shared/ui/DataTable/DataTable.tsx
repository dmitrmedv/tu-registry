import {
  columnResizingFeature,
  columnSizingFeature,
  type ColumnDef,
  type ColumnSizingState,
  type RowData,
  functionalUpdate,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import clsx from 'clsx';
import {
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type ThHTMLAttributes,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import tableStyles from '../Table/Table.module.scss';
import styles from './DataTable.module.scss';

/** One column: what it shows and how wide it may be. Sorting and filtering stay with the page. */
export type DataTableColumn<T> = {
  id: string;
  /** Names the column for the resize handle (the header itself may be a button). */
  label: string;
  /** What goes inside <th>; the label by default. */
  header?: ReactNode;
  /** Extra <th> attributes, e.g. aria-sort for a server-sorted column. */
  headerProps?: ThHTMLAttributes<HTMLTableCellElement>;
  cell: (row: T) => ReactNode;
  /** Long text wraps within the width; short values stay on one line. */
  wrap?: boolean;
  /** The default width, px. */
  size: number;
  minSize?: number;
  /** Stays where it is: it cannot be dragged, and nothing is dropped onto it. */
  fixed?: boolean;
};

export type ColumnWidths = Record<string, number>;

type Props<T extends RowData> = {
  caption: string;
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  rowProps?: (row: T) => HTMLAttributes<HTMLTableRowElement>;
  /** Only the widths the viewer changed; the rest use the column's size. */
  widths: ColumnWidths;
  onWidthsChange: (widths: ColumnWidths) => void;
  /** Dragging a header onto another one: the page decides the new order. */
  onColumnMove?: (id: string, targetId: string) => void;
};

const features = tableFeatures({ columnSizingFeature, columnResizingFeature });

const KEYBOARD_STEP = 16;
const DEFAULT_MIN_SIZE = 60;
const MAX_SIZE = 1000;

/**
 * A table whose columns the viewer can widen or narrow: drag the header's right edge, use the
 * arrow keys on it, or double-click it for the default width. With onColumnMove, a header can
 * be dragged onto another to move the column (mouse only: the page offers a keyboard way).
 * Rows and cells are plain <tr>/<td> with the shared Table styles, so pages keep full control
 * over what a row does.
 */
export function DataTable<T extends RowData>({
  caption,
  rows,
  columns,
  getRowId,
  rowProps,
  widths,
  onWidthsChange,
  onColumnMove,
}: Props<T>) {
  const columnDefs = useMemo<ColumnDef<typeof features, T>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        size: column.size,
        minSize: column.minSize ?? DEFAULT_MIN_SIZE,
        maxSize: MAX_SIZE,
      })),
    [columns],
  );
  const byId = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);

  const table = useTable({
    features,
    columns: columnDefs,
    data: rows,
    getRowId: (row) => getRowId(row),
    columnResizeMode: 'onChange',
    state: { columnSizing: widths },
    onColumnSizingChange: (updater) =>
      onWidthsChange(functionalUpdate(updater, widths) as ColumnSizingState),
  });

  const headers = table.getHeaderGroups()[0]?.headers ?? [];

  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // The header is draggable, so pressing its resize handle must not start moving the column.
  const pressingHandle = useRef(false);
  useEffect(() => {
    const release = () => {
      pressingHandle.current = false;
    };
    document.addEventListener('mouseup', release);
    return () => document.removeEventListener('mouseup', release);
  }, []);
  const endDrag = () => {
    setDragged(null);
    setDropTarget(null);
  };
  const dragProps = (column: DataTableColumn<T>): ThHTMLAttributes<HTMLTableCellElement> => {
    if (!onColumnMove || column.fixed) return {};
    const canDrop = dragged !== null && dragged !== column.id;
    return {
      draggable: true,
      onDragStart: (event) => {
        if (pressingHandle.current) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', column.id);
        setDragged(column.id);
      },
      onDragOver: (event) => {
        if (!canDrop) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropTarget(column.id);
      },
      onDragLeave: () => setDropTarget((current) => (current === column.id ? null : current)),
      onDrop: (event) => {
        event.preventDefault();
        if (canDrop) onColumnMove(dragged, column.id);
        endDrag();
      },
      onDragEnd: endDrag,
    };
  };
  // Where the moved column will land: after the target when moving right, before it otherwise.
  const draggedIndex = headers.findIndex((header) => header.column.id === dragged);
  const lastId = headers.at(-1)?.column.id;

  return (
    <div className={tableStyles.scroll}>
      <table
        className={clsx(tableStyles.table, styles.table)}
        // The last column takes whatever room is left, so the table always fills its box.
        style={{ width: `max(100%, ${table.getTotalSize()}px)` }}
      >
        <caption className="visually-hidden">{caption}</caption>
        <colgroup>
          {headers.map((header) => (
            <col
              key={header.id}
              style={header.column.id === lastId ? undefined : { width: header.getSize() }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {headers.map((header, index) => {
              const column = byId.get(header.column.id)!;
              const resize = (delta: number) =>
                table.setColumnSizing((current) => ({
                  ...current,
                  [header.column.id]: header.getSize() + delta,
                }));
              const onKeyDown = (event: KeyboardEvent) => {
                const delta = { ArrowLeft: -KEYBOARD_STEP, ArrowRight: KEYBOARD_STEP }[event.key];
                if (delta === undefined) return;
                event.preventDefault();
                resize(delta);
              };
              const handler = header.getResizeHandler();
              return (
                <th
                  key={header.id}
                  scope="col"
                  {...column.headerProps}
                  {...dragProps(column)}
                  className={clsx(
                    styles.th,
                    onColumnMove && !column.fixed && styles.movable,
                    dragged === column.id && styles.dragged,
                    dropTarget === column.id &&
                      (index > draggedIndex ? styles.dropAfter : styles.dropBefore),
                  )}
                >
                  {column.header ?? column.label}
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Ширина колонки «${column.label}»`}
                    aria-valuenow={header.getSize()}
                    aria-valuemin={column.minSize ?? DEFAULT_MIN_SIZE}
                    aria-valuemax={MAX_SIZE}
                    tabIndex={0}
                    className={clsx(
                      styles.resizer,
                      header.column.getIsResizing() && styles.resizing,
                    )}
                    onMouseDown={(event) => {
                      pressingHandle.current = true;
                      handler(event);
                    }}
                    onTouchStart={handler}
                    onDoubleClick={() => header.column.resetSize()}
                    onKeyDown={onKeyDown}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} {...rowProps?.(row.original)}>
              {headers.map((header) => {
                const column = byId.get(header.column.id)!;
                return (
                  <td key={header.id} className={column.wrap ? styles.wrap : styles.nowrap}>
                    {column.cell(row.original)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
