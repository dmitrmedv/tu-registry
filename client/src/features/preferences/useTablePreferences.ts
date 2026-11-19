import type { PreferenceTable, TablePreferences } from '@tu-registry/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { preferencesApi } from './api';

/** Widths change on every step of a drag: the server gets the layout once it settles. */
export const SAVE_DELAY_MS = 400;

type Options = {
  /** The layout shown now (from this browser's copy until the server answers). */
  current: TablePreferences;
  /** Shows the layout saved on the server. */
  apply: (preferences: TablePreferences) => void;
};

/**
 * Keeps a user's table layout on the server, so it follows them to any computer (agreed
 * 2026-11-19); this browser's copy only makes the first paint instant. The server's layout
 * wins on load, unless the user already changed something; a layout kept only in this browser
 * (from before) is sent up once. A failed save loses nothing here: the browser's copy stays.
 */
export function useTablePreferences(table: PreferenceTable, { current, apply }: Options) {
  const queryClient = useQueryClient();
  const queryKey = ['preferences', table];
  const saved = useQuery({
    queryKey,
    queryFn: () => preferencesApi.get(table),
    staleTime: Infinity,
  });
  const latest = useRef(current);
  latest.current = current;
  const changed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const send = useCallback(async () => {
    timer.current = undefined;
    try {
      const result = await preferencesApi.save(table, latest.current);
      queryClient.setQueryData(['preferences', table], result);
    } catch {
      // A convenience, not data: the layout stays in this browser and goes with the next change.
    }
  }, [queryClient, table]);

  /** Call after every change: the newest layout reaches the server once changes settle. */
  const persist = useCallback(
    (next: TablePreferences) => {
      latest.current = next;
      changed.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void send(), SAVE_DELAY_MS);
    },
    [send],
  );

  const { data } = saved;
  const handled = useRef(false);
  useEffect(() => {
    if (!data || handled.current) return;
    handled.current = true;
    if (changed.current) return; // Already changed here: that goes up instead.
    if (data.updatedAt) {
      apply({ visible: data.visible, widths: data.widths, order: data.order });
    } else if (!isEmpty(latest.current)) {
      persist(latest.current);
    }
  }, [data, apply, persist]);

  // Leaving the page right after a change still saves it.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void send();
      }
    },
    [send],
  );

  return { persist };
}

const isEmpty = ({ visible, widths, order }: TablePreferences) =>
  Object.keys(visible).length === 0 && Object.keys(widths).length === 0 && order.length === 0;
