import type {
  ApplicationListItemDto,
  ApplicationListQuery,
  Paginated,
  UserOptionDto,
} from '@tu-registry/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from '@/shared/api/http';

const registryApi = {
  list: (query: ApplicationListQuery) =>
    http
      .get<Paginated<ApplicationListItemDto>>('/applications', { params: query })
      .then((r) => r.data),
  userOptions: () => http.get<UserOptionDto[]>('/users/options').then((r) => r.data),
};

export function useApplicationList(query: ApplicationListQuery) {
  return useQuery({
    // Shares the "applications" prefix, so registering a new one refreshes the list.
    queryKey: ['applications', 'list', query],
    queryFn: () => registryApi.list(query),
    // Keep showing the current page while the next one loads: no flicker when paging.
    placeholderData: keepPreviousData,
  });
}

export function useUserOptions() {
  return useQuery({
    queryKey: ['users', 'options'],
    queryFn: registryApi.userOptions,
    staleTime: 5 * 60_000,
  });
}
