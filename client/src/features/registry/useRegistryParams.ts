import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  countActiveFilters,
  DEFAULT_PARAMS,
  readParams,
  type RegistryParams,
  writeParams,
} from './registryParams';

export function useRegistryParams() {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => readParams(search), [search]);

  /** Any change other than the page itself starts again from page 1. */
  const update = useCallback(
    (patch: Partial<RegistryParams>, options: { replace?: boolean } = {}) => {
      setSearch((previous) => writeParams({ ...readParams(previous), page: 1, ...patch }), {
        replace: options.replace,
      });
    },
    [setSearch],
  );

  /** Clears filters; keeps the chosen sort order and page size. */
  const reset = useCallback(() => {
    setSearch((previous) => {
      const { sort, limit } = readParams(previous);
      return writeParams({ ...DEFAULT_PARAMS, sort, limit });
    });
  }, [setSearch]);

  return { params, update, reset, activeFilterCount: countActiveFilters(params) };
}
