import { useEffect, useId, useRef, useState } from 'react';
import { Button, IconButton } from '@/shared/ui';
import type { RegistryColumn } from './registryColumns';
import styles from './registry.module.scss';

type Props = {
  columns: RegistryColumn[];
  isVisible: (column: RegistryColumn) => boolean;
  onChange: (id: RegistryColumn['id'], visible: boolean) => void;
  /** Puts a column where another one is (the keyboard way to reorder; the table also drags). */
  onMove: (id: RegistryColumn['id'], targetId: RegistryColumn['id']) => void;
  onReset: () => void;
  isDefault: boolean;
};

/**
 * «Колонки»: a disclosure with a checkbox per column (plain checkboxes: a list of independent
 * on/off choices, not a menu). Escape or a click outside closes it.
 */
export function ColumnsPicker({ columns, isVisible, onChange, onMove, onReset, isDefault }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.columnsPicker} ref={wrapperRef}>
      <Button
        ref={buttonRef}
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        Колонки<span aria-hidden="true">{open ? ' ▴' : ' ▾'}</span>
      </Button>
      {/* Rendered only while open: its checkboxes repeat the names of filter fields. */}
      {open && (
        <div id={panelId} className={styles.columnsPanel}>
          <IconButton
            icon="restore"
            label="Колонки як за замовчуванням"
            disabled={isDefault}
            onClick={onReset}
          />
          <fieldset>
            <legend>Показувати колонки</legend>
            {columns.map((column, index) => {
              const previous = columns[index - 1];
              const next = columns[index + 1];
              return (
                <div key={column.id} className={styles.columnRow}>
                  <label className={styles.columnOption}>
                    <input
                      type="checkbox"
                      checked={isVisible(column)}
                      onChange={(e) => onChange(column.id, e.target.checked)}
                    />
                    {column.label}
                  </label>
                  <IconButton
                    icon="chevronUp"
                    label={`Вище: ${column.label}`}
                    disabled={!previous}
                    onClick={() => previous && onMove(column.id, previous.id)}
                  />
                  <IconButton
                    icon="chevronDown"
                    label={`Нижче: ${column.label}`}
                    disabled={!next}
                    onClick={() => next && onMove(column.id, next.id)}
                  />
                </div>
              );
            })}
          </fieldset>
        </div>
      )}
    </div>
  );
}
