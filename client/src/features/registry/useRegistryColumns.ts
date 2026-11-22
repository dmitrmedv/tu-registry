import type { TablePreferences } from '@tu-registry/shared';
import { useCallback, useMemo, useState } from 'react';
import { useTablePreferences } from '@/features/preferences';
import type { ColumnWidths } from '@/shared/ui';
import { REGISTRY_COLUMNS, type RegistryColumn } from './registryColumns';

type ColumnId = RegistryColumn['id'];
/**
 * Only what the viewer changed: columns added later still follow their default. «№» may be
 * hidden too (2026-11-22); it is shown by default.
 */
type Choices = Partial<Record<ColumnId | 'regNumber', boolean>>;
type Layout = { choices: Choices; widths: ColumnWidths; order: ColumnId[] };

const KEY_PREFIX = 'tu-registry:registry-columns:';
const WIDTHS_KEY_PREFIX = 'tu-registry:registry-widths:';
const ORDER_KEY_PREFIX = 'tu-registry:registry-order:';
/** «№» is not a RegistryColumn, but its width is the viewer's choice too. */
const KNOWN = new Set<string>(['regNumber', ...REGISTRY_COLUMNS.map((column) => column.id)]);
const EMPTY: Layout = { choices: {}, widths: {}, order: [] };

const isChoice = (value: unknown) => typeof value === 'boolean';
const isWidth = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Keeps what this version knows: the server or the browser may hold columns since removed. */
function known<V>(stored: unknown, isValid: (value: unknown) => boolean) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored).filter(([id, value]) => KNOWN.has(id) && isValid(value)),
  ) as Partial<Record<string, V>>;
}

/** The viewer's order of the columns after «№»; columns added later go to the end. */
function knownOrder(stored: unknown): ColumnId[] {
  if (!Array.isArray(stored)) return [];
  const ids = stored.filter((id): id is ColumnId => typeof id === 'string' && KNOWN.has(id));
  return [...new Set(ids)];
}

const toLayout = ({ visible, widths, order }: TablePreferences): Layout => ({
  choices: known<boolean>(visible, isChoice) as Choices,
  widths: known<number>(widths, isWidth) as ColumnWidths,
  order: knownOrder(order),
});
const toPreferences = ({ choices, widths, order }: Layout): TablePreferences => ({
  visible: choices as Record<string, boolean>,
  widths,
  order,
});

/** This browser's copy: storage may be unavailable (private mode), then defaults apply. */
function read(key: string, fallback: string): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? fallback);
  } catch {
    return undefined;
  }
}

function write(key: string, value: object) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not cached: the server still has it.
  }
}

/**
 * Which registry columns this user shows, in what order and how wide. Kept on the server per
 * user (`useTablePreferences`), so the layout follows them to another computer; this browser
 * keeps a copy for the first paint.
 */
export function useRegistryColumns(userId: string, isAdmin: boolean) {
  const keys = useMemo(
    () => ({
      choices: KEY_PREFIX + userId,
      widths: WIDTHS_KEY_PREFIX + userId,
      order: ORDER_KEY_PREFIX + userId,
    }),
    [userId],
  );
  const [layout, setLayout] = useState<Layout>(() =>
    toLayout({
      visible: read(keys.choices, '{}') as Record<string, boolean>,
      widths: read(keys.widths, '{}') as Record<string, number>,
      order: read(keys.order, '[]') as string[],
    }),
  );
  const { choices, widths, order } = layout;

  const show = useCallback(
    (next: Layout) => {
      setLayout(next);
      write(keys.choices, next.choices);
      write(keys.widths, next.widths);
      write(keys.order, next.order);
    },
    [keys],
  );
  const apply = useCallback((saved: TablePreferences) => show(toLayout(saved)), [show]);
  const { persist } = useTablePreferences('registry', { current: toPreferences(layout), apply });
  const change = useCallback(
    (next: Layout) => {
      show(next);
      persist(toPreferences(next));
    },
    [show, persist],
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
  // At least one column stays: with nothing else shown, «№» is.
  const numberShown =
    (choices.regNumber ?? true) ||
    !available.some((column) => choices[column.id] ?? column.visibleByDefault);
  const setNumberShown = useCallback(
    (visible: boolean) => change({ ...layout, choices: { ...choices, regNumber: visible } }),
    [change, layout, choices],
  );
  const isVisible = useCallback(
    (column: RegistryColumn) => choices[column.id] ?? column.visibleByDefault,
    [choices],
  );
  const setVisible = useCallback(
    (id: ColumnId, visible: boolean) =>
      change({ ...layout, choices: { ...choices, [id]: visible } }),
    [change, layout, choices],
  );
  // Every step of a drag: the cache follows at once, the server once the drag settles.
  const setWidths = useCallback(
    (next: ColumnWidths) => change({ ...layout, widths: next }),
    [change, layout],
  );
  /** Puts the column where the target is: after it when moving down/right, before it otherwise. */
  const moveColumn = useCallback(
    (id: ColumnId, targetId: ColumnId) => {
      const ids = available.map((column) => column.id);
      const to = ids.indexOf(targetId);
      if (!ids.includes(id) || to === -1 || id === targetId) return;
      const next = ids.filter((other) => other !== id);
      next.splice(to, 0, id);
      change({ ...layout, order: next });
    },
    [available, change, layout],
  );
  const resetColumns = useCallback(() => change(EMPTY), [change]);

  return {
    available,
    visible: available.filter(isVisible),
    isVisible,
    numberShown,
    setNumberShown,
    setVisible,
    resetColumns,
    widths,
    setWidths,
    moveColumn,
    isDefault:
      Object.keys(choices).length === 0 && Object.keys(widths).length === 0 && order.length === 0,
  };
}
