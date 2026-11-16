import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';

type ListParams = { page: number };

type Options<T extends ListParams> = {
  read: (search: URLSearchParams) => T;
  write: (params: T) => URLSearchParams;
  /** Values `reset` restores; fields listed in `keepOnReset` survive it (e.g. sort, page size). */
  defaults: T;
  keepOnReset?: (keyof T)[];
};

/**
 * List state kept in the URL: shareable links, and the browser's Back button works.
 * Any change other than the page itself starts again from page 1.
 */
export function useListParams<T extends ListParams>({
  read,
  write,
  defaults,
  keepOnReset = [],
}: Options<T>) {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => read(search), [read, search]);

  // The URL as last written. Two changes in one moment (a chip removed, then a select changed)
  // happen before a re-render, and the router hands both the same, older URL: each would undo
  // the other. Building on this instead keeps both. Caught up with every navigation.
  const latest = useRef(search);
  useEffect(() => {
    latest.current = search;
  }, [search]);

  const navigate = useCallback(
    (next: URLSearchParams, replace?: boolean) => {
      latest.current = next;
      setSearch(next, { replace });
    },
    [setSearch],
  );

  const update = useCallback(
    (patch: Partial<T>, options: { replace?: boolean } = {}) => {
      navigate(write({ ...read(latest.current), page: 1, ...patch }), options.replace);
    },
    [read, write, navigate],
  );

  const reset = useCallback(() => {
    const current = read(latest.current);
    const kept = Object.fromEntries(keepOnReset.map((key) => [key, current[key]]));
    navigate(write({ ...defaults, ...kept }));
    // keepOnReset is a static list per caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, write, defaults, navigate]);

  return { params, update, reset };
}
