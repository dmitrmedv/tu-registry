import { useCallback, useMemo } from 'react';
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

  const update = useCallback(
    (patch: Partial<T>, options: { replace?: boolean } = {}) => {
      setSearch((previous) => write({ ...read(previous), page: 1, ...patch }), {
        replace: options.replace,
      });
    },
    [read, write, setSearch],
  );

  const reset = useCallback(() => {
    setSearch((previous) => {
      const current = read(previous);
      const kept = Object.fromEntries(keepOnReset.map((key) => [key, current[key]]));
      return write({ ...defaults, ...kept });
    });
    // keepOnReset is a static list per caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, write, defaults, setSearch]);

  return { params, update, reset };
}
