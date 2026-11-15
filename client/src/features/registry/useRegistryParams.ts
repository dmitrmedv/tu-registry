import { useListParams } from '@/shared/hooks/useListParams';
import { countActiveFilters, DEFAULT_PARAMS, readParams, writeParams } from './registryParams';

export function useRegistryParams() {
  const { params, update, reset } = useListParams({
    read: readParams,
    write: writeParams,
    defaults: DEFAULT_PARAMS,
    // Clearing filters keeps the chosen sort order and page size.
    keepOnReset: ['sort', 'limit'],
  });
  return { params, update, reset, activeFilterCount: countActiveFilters(params) };
}
