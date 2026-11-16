import { useCallback, useMemo, useState } from 'react';
import { REGISTRY_COLUMNS, type RegistryColumn } from './registryColumns';

type ColumnId = RegistryColumn['id'];
/** Only what the viewer changed: columns added later still follow their default. */
type Choices = Partial<Record<ColumnId, boolean>>;

const KEY_PREFIX = 'tu-registry:registry-columns:';
const KNOWN = new Set<string>(REGISTRY_COLUMNS.map((column) => column.id));

/** A per-viewer convenience: storage may be unavailable (private mode), then defaults apply. */
function load(key: string): Choices {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(stored).filter(([id, value]) => KNOWN.has(id) && typeof value === 'boolean'),
    ) as Choices;
  } catch {
    return {};
  }
}

function save(key: string, choices: Choices) {
  try {
    window.localStorage.setItem(key, JSON.stringify(choices));
  } catch {
    // Not saved: the choice still applies until the page is reloaded.
  }
}

/** Which registry columns this user shows; remembered in this browser, per user. */
export function useRegistryColumns(userId: string, isAdmin: boolean) {
  const key = KEY_PREFIX + userId;
  const [choices, setChoices] = useState<Choices>(() => load(key));

  const available = useMemo(
    () => REGISTRY_COLUMNS.filter((column) => isAdmin || !column.adminOnly),
    [isAdmin],
  );
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
  const resetColumns = useCallback(() => {
    setChoices({});
    save(key, {});
  }, [key]);

  return {
    available,
    visible: available.filter(isVisible),
    isVisible,
    setVisible,
    resetColumns,
    isDefault: Object.keys(choices).length === 0,
  };
}
