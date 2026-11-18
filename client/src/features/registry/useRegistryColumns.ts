import { useCallback, useMemo, useState } from 'react';
import type { ColumnWidths } from '@/shared/ui';
import { REGISTRY_COLUMNS, type RegistryColumn } from './registryColumns';

type ColumnId = RegistryColumn['id'];
/** Only what the viewer changed: columns added later still follow their default. */
type Choices = Partial<Record<ColumnId, boolean>>;

const KEY_PREFIX = 'tu-registry:registry-columns:';
const WIDTHS_KEY_PREFIX = 'tu-registry:registry-widths:';
const ORDER_KEY_PREFIX = 'tu-registry:registry-order:';
/** «№» is not a RegistryColumn, but its width is the viewer's choice too. */
const KNOWN = new Set<string>(['regNumber', ...REGISTRY_COLUMNS.map((column) => column.id)]);

const isChoice = (value: unknown) => typeof value === 'boolean';
const isWidth = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** A per-viewer convenience: storage may be unavailable (private mode), then defaults apply. */
function load<V>(key: string, isValid: (value: unknown) => boolean): Partial<Record<string, V>> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(stored).filter(([id, value]) => KNOWN.has(id) && isValid(value)),
    ) as Partial<Record<string, V>>;
  } catch {
    return {};
  }
}

/** The viewer's order of the columns after «№»; columns added later go to the end. */
function loadOrder(key: string): ColumnId[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown;
    if (!Array.isArray(stored)) return [];
    const ids = stored.filter((id): id is ColumnId => typeof id === 'string' && KNOWN.has(id));
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

function save(key: string, value: object) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saved: the choice still applies until the page is reloaded.
  }
}

/** Which registry columns this user shows, and how wide; remembered in this browser, per user. */
export function useRegistryColumns(userId: string, isAdmin: boolean) {
  const key = KEY_PREFIX + userId;
  const widthsKey = WIDTHS_KEY_PREFIX + userId;
  const orderKey = ORDER_KEY_PREFIX + userId;
  const [order, setOrder] = useState<ColumnId[]>(() => loadOrder(orderKey));
  const [choices, setChoices] = useState<Choices>(() => load<boolean>(key, isChoice) as Choices);
  const [widths, setWidthsState] = useState<ColumnWidths>(
    () => load<number>(widthsKey, isWidth) as ColumnWidths,
  );

  const available = useMemo(() => {
    const rank = (column: RegistryColumn) => {
      const index = order.indexOf(column.id);
      return index === -1 ? order.length + REGISTRY_COLUMNS.indexOf(column) : index;
    };
    return REGISTRY_COLUMNS.filter((column) => isAdmin || !column.adminOnly).sort(
      (a, b) => rank(a) - rank(b),
    );
  }, [isAdmin, order]);
  const isVisible = useCallback(
    (column: RegistryColumn) => choices[column.id] ?? column.visibleByDefault,
    [choices],
  );
  const setVisible = useCallback(
    (id: ColumnId, visible: boolean) => {
      setChoices((current) => {
        const next = { ...current, [id]: visible };
        save(key, next);
        return next;
      });
    },
    [key],
  );
  // Saved on every step of a drag: the value is a few dozen bytes.
  const setWidths = useCallback(
    (next: ColumnWidths) => {
      setWidthsState(next);
      save(widthsKey, next);
    },
    [widthsKey],
  );
  /** Puts the column where the target is: after it when moving down/right, before it otherwise. */
  const moveColumn = useCallback(
    (id: ColumnId, targetId: ColumnId) => {
      const ids = available.map((column) => column.id);
      const to = ids.indexOf(targetId);
      if (!ids.includes(id) || to === -1 || id === targetId) return;
      const next = ids.filter((other) => other !== id);
      next.splice(to, 0, id);
      setOrder(next);
      save(orderKey, next);
    },
    [available, orderKey],
  );
  const resetColumns = useCallback(() => {
    setChoices({});
    save(key, {});
    setWidths({});
    setOrder([]);
    save(orderKey, []);
  }, [key, orderKey, setWidths]);

  return {
    available,
    visible: available.filter(isVisible),
    isVisible,
    setVisible,
    resetColumns,
    widths,
    setWidths,
    moveColumn,
    isDefault:
      Object.keys(choices).length === 0 && Object.keys(widths).length === 0 && order.length === 0,
  };
}
